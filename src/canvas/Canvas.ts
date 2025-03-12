import { classRegistry } from '../ClassRegistry';
import { isCollection } from '../Collection';
import { NONE } from '../constants';
import type {
  CanvasEvents,
  DragEventData,
  ObjectEvents,
  TPointerEvent,
  TPointerEventNames,
  Transform,
} from '../EventTypeDefs';
import { Point } from '../Point';
import type { ActiveSelection } from '../shapes/ActiveSelection';
import type { Group } from '../shapes/Group';
import type { IText } from '../shapes/IText/IText';
import type { FabricObject } from '../shapes/Object/FabricObject';
import { isTouchEvent, stopEvent } from '../util/dom_event';
import { getDocumentFromElement, getWindowFromElement } from '../util/dom_misc';
import { sendPointToPlane } from '../util/misc/planeChange';
import { isActiveSelection } from '../util/typeAssertions';
import type { CanvasOptions, TCanvasOptions } from './CanvasOptions';
import { SelectableCanvas } from './SelectableCanvas';
import { TextEditingManager } from './TextEditingManager';

const addEventOptions = { passive: false } as EventListenerOptions;

const getEventPoints = (canvas: Canvas, e: TPointerEvent) => {
  const viewportPoint = canvas.getViewportPoint(e);
  const scenePoint = canvas.getScenePoint(e);
  return {
    viewportPoint,
    scenePoint,
    pointer: viewportPoint,
    absolutePointer: scenePoint,
  };
};

// just to be clear, the utils are now deprecated and those are here exactly as minifier helpers
// because el.addEventListener can't me be minified while a const yes and we use it 47 times in this file.
// few bytes but why give it away.
const addListener = (
  el: HTMLElement | Document,
  ...args: Parameters<HTMLElement['addEventListener']>
) => el.addEventListener(...args);
const removeListener = (
  el: HTMLElement | Document,
  ...args: Parameters<HTMLElement['removeEventListener']>
) => el.removeEventListener(...args);

const syntheticEventConfig = {
  mouse: {
    in: 'over',
    out: 'out',
    targetIn: 'mouseover',
    targetOut: 'mouseout',
    canvasIn: 'mouse:over',
    canvasOut: 'mouse:out',
  },
  drag: {
    in: 'enter',
    out: 'leave',
    targetIn: 'dragenter',
    targetOut: 'dragleave',
    canvasIn: 'drag:enter',
    canvasOut: 'drag:leave',
  },
} as const;

type TSyntheticEventContext = {
  mouse: { e: TPointerEvent };
  drag: DragEventData;
};

export class Canvas extends SelectableCanvas implements CanvasOptions {
  /**
   * Contains the id of the touch event that owns the fabric transform
   * @type Number
   * @private
   */
  declare mainTouchId?: number;

  declare enablePointerEvents: boolean;

  /**
   * Holds a reference to a setTimeout timer for event synchronization
   * @type number
   * @private
   */
  private declare _willAddMouseDown: number;

  /**
   * Holds a reference to an object on the canvas that is receiving the drag over event.
   * @type FabricObject
   * @private
   */
  private declare _draggedoverTarget?: FabricObject;

  /**
   * Holds a reference to an object on the canvas from where the drag operation started
   * @type FabricObject
   * @private
   */
  private declare _dragSource?: FabricObject;

  /**
   * Holds a reference to an object on the canvas that is the current drop target
   * May differ from {@link _draggedoverTarget}
   * @todo inspect whether {@link _draggedoverTarget} and {@link _dropTarget} should be merged somehow
   * @type FabricObject
   * @private
   */
  private declare _dropTarget: FabricObject<ObjectEvents> | undefined;

  private _isClick: boolean;

  textEditingManager = new TextEditingManager(this);

  constructor(el?: string | HTMLCanvasElement, options: TCanvasOptions = {}) {
    super(el, options);
    // bind event handlers
    (
      [
        '_onMouseDown',
        '_onTouchStart',
        '_onMouseMove',
        '_onMouseUp',
        '_onTouchEnd',
        '_onResize',
        // '_onGesture',
        // '_onDrag',
        // '_onShake',
        // '_onLongPress',
        // '_onOrientationChange',
        '_onMouseWheel',
        '_onMouseOut',
        '_onMouseEnter',
        '_onContextMenu',
        '_onDoubleClick',
        '_onDragStart',
        '_onDragEnd',
        '_onDragProgress',
        '_onDragOver',
        '_onDragEnter',
        '_onDragLeave',
        '_onDrop',
      ] as (keyof this)[]
    ).forEach((eventHandler) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      this[eventHandler] = (this[eventHandler] as Function).bind(this);
    });
    // register event handlers
    this.addOrRemove(addListener, 'add');
  }

  /**
   * return an event prefix pointer or mouse.
   * @private
   */
  private _getEventPrefix() {
    return this.enablePointerEvents ? 'pointer' : 'mouse';
  }

  addOrRemove(functor: any, _eventjsFunctor: 'add' | 'remove') {
    const canvasElement = this.upperCanvasEl,
      eventTypePrefix = this._getEventPrefix();
    functor(getWindowFromElement(canvasElement), 'resize', this._onResize);
    functor(canvasElement, eventTypePrefix + 'down', this._onMouseDown);
    functor(
      canvasElement,
      `${eventTypePrefix}move`,
      this._onMouseMove,
      addEventOptions,
    );
    functor(canvasElement, `${eventTypePrefix}out`, this._onMouseOut);
    functor(canvasElement, `${eventTypePrefix}enter`, this._onMouseEnter);
    functor(canvasElement, 'wheel', this._onMouseWheel);
    functor(canvasElement, 'contextmenu', this._onContextMenu);
    functor(canvasElement, 'dblclick', this._onDoubleClick);
    functor(canvasElement, 'dragstart', this._onDragStart);
    functor(canvasElement, 'dragend', this._onDragEnd);
    functor(canvasElement, 'dragover', this._onDragOver);
    functor(canvasElement, 'dragenter', this._onDragEnter);
    functor(canvasElement, 'dragleave', this._onDragLeave);
    functor(canvasElement, 'drop', this._onDrop);
    if (!this.enablePointerEvents) {
      functor(canvasElement, 'touchstart', this._onTouchStart, addEventOptions);
    }
    // if (typeof eventjs !== 'undefined' && eventjsFunctor in eventjs) {
    //   eventjs[eventjsFunctor](canvasElement, 'gesture', this._onGesture);
    //   eventjs[eventjsFunctor](canvasElement, 'drag', this._onDrag);
    //   eventjs[eventjsFunctor](
    //     canvasElement,
    //     'orientation',
    //     this._onOrientationChange
    //   );
    //   eventjs[eventjsFunctor](canvasElement, 'shake', this._onShake);
    //   eventjs[eventjsFunctor](canvasElement, 'longpress', this._onLongPress);
    // }
  }

  /**
   * Removes all event listeners, used when disposing the instance
   */
  removeListeners() {
    this.addOrRemove(removeListener, 'remove');
    // if you dispose on a mouseDown, before mouse up, you need to clean document to...
    const eventTypePrefix = this._getEventPrefix();
    const doc = getDocumentFromElement(this.upperCanvasEl);
    removeListener(
      doc,
      `${eventTypePrefix}up`,
      this._onMouseUp as EventListener,
    );
    removeListener(
      doc,
      'touchend',
      this._onTouchEnd as EventListener,
      addEventOptions,
    );
    removeListener(
      doc,
      `${eventTypePrefix}move`,
      this._onMouseMove as EventListener,
      addEventOptions,
    );
    removeListener(
      doc,
      'touchmove',
      this._onMouseMove as EventListener,
      addEventOptions,
    );
    clearTimeout(this._willAddMouseDown);
  }

  /**
   * @private
   * @param {Event} [e] Event object fired on wheel event
   */
  private _onMouseWheel(e: MouseEvent) {
    this.__onMouseWheel(e);
  }

  /**
   * @private
   * @param {Event} e Event object fired on mousedown
   */
  private _onMouseOut(e: TPointerEvent) {
    const target = this._hoveredTarget;
    const shared = {
      e,
      ...getEventPoints(this, e),
    };
    this.fire('mouse:out', { ...shared, target });
    this._hoveredTarget = undefined;
    target && target.fire('mouseout', { ...shared });
    this._hoveredTargets.forEach((nestedTarget) => {
      this.fire('mouse:out', { ...shared, target: nestedTarget });
      nestedTarget && nestedTarget.fire('mouseout', { ...shared });
    });
    this._hoveredTargets = [];
  }

  /**
   * @private
   * @param {Event} e Event object fired on mouseenter
   */
  private _onMouseEnter(e: TPointerEvent) {
    // This find target and consequent 'mouse:over' is used to
    // clear old instances on hovered target.
    // calling findTarget has the side effect of killing target.__corner.
    // as a short term fix we are not firing this if we are currently transforming.
    // as a long term fix we need to separate the action of finding a target with the
    // side effects we added to it.
    if (!this._currentTransform && !this.findTarget(e)) {
      this.fire('mouse:over', {
        e,
        ...getEventPoints(this, e),
      });
      this._hoveredTarget = undefined;
      this._hoveredTargets = [];
    }
  }

  /**
   * supports native like text dragging
   * @private
   * @param {DragEvent} e
   */
  private _onDragStart(e: DragEvent) {
    this._isClick = false;
    const activeObject = this.getActiveObject();
    if (activeObject && activeObject.onDragStart(e)) {
      this._dragSource = activeObject;
      const options = { e, target: activeObject };
      this.fire('dragstart', options);
      activeObject.fire('dragstart', options);
      addListener(
        this.upperCanvasEl,
        'drag',
        this._onDragProgress as EventListener,
      );
      return;
    }
    stopEvent(e);
  }

  /**
   * First we clear top context where the effects are being rendered.
   * Then we render the effects.
   * Doing so will render the correct effect for all cases including an overlap between `source` and `target`.
   * @private
   */
  private _renderDragEffects(
    e: DragEvent,
    source?: FabricObject,
    target?: FabricObject,
  ) {
    let dirty = false;
    // clear top context
    const dropTarget = this._dropTarget;
    if (dropTarget && dropTarget !== source && dropTarget !== target) {
      dropTarget.clearContextTop();
      dirty = true;
    }
    source?.clearContextTop();
    target !== source && target?.clearContextTop();
    // render effects
    const ctx = this.contextTop;
    ctx.save();
    ctx.transform(...this.viewportTransform);
    if (source) {
      ctx.save();
      source.transform(ctx);
      source.renderDragSourceEffect(e);
      ctx.restore();
      dirty = true;
    }
    if (target) {
      ctx.save();
      target.transform(ctx);
      target.renderDropTargetEffect(e);
      ctx.restore();
      dirty = true;
    }
    ctx.restore();
    dirty && (this.contextTopDirty = true);
  }

  /**
   * supports native like text dragging
   * https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Drag_operations#finishing_a_drag
   * @private
   * @param {DragEvent} e
   */
  private _onDragEnd(e: DragEvent) {
    const didDrop = !!e.dataTransfer && e.dataTransfer.dropEffect !== NONE,
      dropTarget = didDrop ? this._activeObject : undefined,
      options = {
        e,
        target: this._dragSource as FabricObject,
        subTargets: this.targets,
        dragSource: this._dragSource as FabricObject,
        didDrop,
        dropTarget: dropTarget as FabricObject,
      };
    removeListener(
      this.upperCanvasEl,
      'drag',
      this._onDragProgress as EventListener,
    );
    this.fire('dragend', options);
    this._dragSource && this._dragSource.fire('dragend', options);
    delete this._dragSource;
    // we need to call mouse up synthetically because the browser won't
    this._onMouseUp(e);
  }

  /**
   * fire `drag` event on canvas and drag source
   * @private
   * @param {DragEvent} e
   */
  private _onDragProgress(e: DragEvent) {
    const options = {
      e,
      target: this._dragSource as FabricObject | undefined,
      dragSource: this._dragSource as FabricObject | undefined,
      dropTarget: this._draggedoverTarget as FabricObject,
    };
    this.fire('drag', options);
    this._dragSource && this._dragSource.fire('drag', options);
  }

  /**
   * As opposed to {@link findTarget} we want the top most object to be returned w/o the active object cutting in line.
   * Override at will
   */
  protected findDragTargets(e: DragEvent) {
    this.targets = [];
    const target = this._searchPossibleTargets(
      this._objects,
      this.getViewportPoint(e),
    );
    return {
      target,
      targets: [...this.targets],
    };
  }

  /**
   * prevent default to allow drop event to be fired
   * https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Drag_operations#specifying_drop_targets
   * @private
   * @param {DragEvent} [e] Event object fired on Event.js shake
   */
  private _onDragOver(e: DragEvent) {
    const eventType = 'dragover';
    const { target, targets } = this.findDragTargets(e);
    const dragSource = this._dragSource as FabricObject;
    const options = {
      e,
      target,
      subTargets: targets,
      dragSource,
      canDrop: false,
      dropTarget: undefined,
    };
    let dropTarget;
    //  fire on canvas
    this.fire(eventType, options);
    //  make sure we fire dragenter events before dragover
    //  if dragleave is needed, object will not fire dragover so we don't need to trouble ourselves with it
    this._fireEnterLeaveEvents(target, options);
    if (target) {
      if (target.canDrop(e)) {
        dropTarget = target;
      }
      target.fire(eventType, options);
    }
    //  propagate the event to subtargets
    for (let i = 0; i < targets.length; i++) {
      const subTarget = targets[i];
      // accept event only if previous targets didn't (the accepting target calls `preventDefault` to inform that the event is taken)
      // TODO: verify if those should loop in inverse order then?
      // what is the order of subtargets?
      if (subTarget.canDrop(e)) {
        dropTarget = subTarget;
      }
      subTarget.fire(eventType, options);
    }
    //  render drag effects now that relations between source and target is clear
    this._renderDragEffects(e, dragSource, dropTarget);
    this._dropTarget = dropTarget;
  }

  /**
   * fire `dragleave` on `dragover` targets
   * @private
   * @param {Event} [e] Event object fired on Event.js shake
   */
  private _onDragEnter(e: DragEvent) {
    const { target, targets } = this.findDragTargets(e);
    const options = {
      e,
      target,
      subTargets: targets,
      dragSource: this._dragSource,
    };
    this.fire('dragenter', options);
    //  fire dragenter on targets
    this._fireEnterLeaveEvents(target, options);
  }

  /**
   * fire `dragleave` on `dragover` targets
   * @private
   * @param {Event} [e] Event object fired on Event.js shake
   */
  private _onDragLeave(e: DragEvent) {
    const options = {
      e,
      target: this._draggedoverTarget,
      subTargets: this.targets,
      dragSource: this._dragSource,
    };
    this.fire('dragleave', options);

    //  fire dragleave on targets
    this._fireEnterLeaveEvents(undefined, options);
    this._renderDragEffects(e, this._dragSource);
    this._dropTarget = undefined;
    //  clear targets
    this.targets = [];
    this._hoveredTargets = [];
  }

  /**
   * `drop:before` is a an event that allows you to schedule logic
   * before the `drop` event. Prefer `drop` event always, but if you need
   * to run some drop-disabling logic on an event, since there is no way
   * to handle event handlers ordering, use `drop:before`
   * @private
   * @param {Event} e
   */
  private _onDrop(e: DragEvent) {
    const { target, targets } = this.findDragTargets(e);
    const options = this._basicEventHandler('drop:before', {
      e,
      target,
      subTargets: targets,
      dragSource: this._dragSource,
      ...getEventPoints(this, e),
    });
    //  will be set by the drop target
    options.didDrop = false;
    //  will be set by the drop target, used in case options.target refuses the drop
    options.dropTarget = undefined;
    //  fire `drop`
    this._basicEventHandler('drop', options);
    //  inform canvas of the drop
    //  we do this because canvas was unaware of what happened at the time the `drop` event was fired on it
    //  use for side effects
    this.fire('drop:after', options);
  }

  /**
   * @private
   * @param {Event} e Event object fired on mousedown
   */
  private _onContextMenu(e: TPointerEvent): false {
    const target = this.findTarget(e),
      subTargets = this.targets || [];
    const options = this._basicEventHandler('contextmenu:before', {
      e,
      target,
      subTargets,
    });
    // TODO: this line is silly because the dev can subscribe to the event and prevent it themselves
    this.stopContextMenu && stopEvent(e);
    this._basicEventHandler('contextmenu', options);
    return false;
  }

  /**
   * @private
   * @param {Event} e Event object fired on mousedown
   */
  private _onDoubleClick(e: TPointerEvent) {
    this._cacheTransformEventData(e);
    this._handleEvent(e, 'dblclick');
    this._resetTransformEventData();
  }

  /**
   * Return a the id of an event.
   * returns either the pointerId or the identifier or 0 for the mouse event
   * @private
   * @param {Event} evt Event object
   */
  getPointerId(evt: TouchEvent | PointerEvent): number {
    const changedTouches = (evt as TouchEvent).changedTouches;

    if (changedTouches) {
      return changedTouches[0] && changedTouches[0].identifier;
    }

    if (this.enablePointerEvents) {
      return (evt as PointerEvent).pointerId;
    }

    return -1;
  }

  /**
   * Determines if an event has the id of the event that is considered main
   * @private
   * @param {evt} event Event object
   */
  _isMainEvent(evt: TPointerEvent): boolean {
    if ((evt as PointerEvent).isPrimary === true) {
      return true;
    }
    if ((evt as PointerEvent).isPrimary === false) {
      return false;
    }
    if (evt.type === 'touchend' && (evt as TouchEvent).touches.length === 0) {
      return true;
    }
    if ((evt as TouchEvent).changedTouches) {
      return (
        (evt as TouchEvent).changedTouches[0].identifier === this.mainTouchId
      );
    }
    return true;
  }

  /**
   * @private
   * @param {Event} e Event object fired on mousedown
   */
  _onTouchStart(e: TouchEvent) {
    // we will prevent scrolling if allowTouchScrolling is not enabled and
    let shouldPreventScrolling = !this.allowTouchScrolling;
    const currentActiveObject = this._activeObject;
    if (this.mainTouchId === undefined) {
      this.mainTouchId = this.getPointerId(e);
    }
    this.__onMouseDown(e);
    // after executing fabric logic for mouse down let's see
    // if we didn't change target or if we are drawing
    // we want to prevent scrolling anyway
    if (
      this.isDrawingMode ||
      (currentActiveObject && this._target === currentActiveObject)
    ) {
      shouldPreventScrolling = true;
    }
    // prevent default, will block scrolling from start
    shouldPreventScrolling && e.preventDefault();
    this._resetTransformEventData();
    const canvasElement = this.upperCanvasEl,
      eventTypePrefix = this._getEventPrefix();
    const doc = getDocumentFromElement(canvasElement);
    addListener(
      doc,
      'touchend',
      this._onTouchEnd as EventListener,
      addEventOptions,
    );
    // if we scroll don't register the touch move event
    shouldPreventScrolling &&
      addListener(
        doc,
        'touchmove',
        this._onMouseMove as EventListener,
        addEventOptions,
      );
    // Unbind mousedown to prevent double triggers from touch devices
    removeListener(
      canvasElement,
      `${eventTypePrefix}down`,
      this._onMouseDown as EventListener,
    );
  }

  /**
   * @private
   * @param {Event} e Event object fired on mousedown
   */
  _onMouseDown(e: TPointerEvent) {
    this.__onMouseDown(e);
    this._resetTransformEventData();
    const canvasElement = this.upperCanvasEl,
      eventTypePrefix = this._getEventPrefix();
    removeListener(
      canvasElement,
      `${eventTypePrefix}move`,
      this._onMouseMove as EventListener,
      addEventOptions,
    );
    const doc = getDocumentFromElement(canvasElement);
    addListener(doc, `${eventTypePrefix}up`, this._onMouseUp as EventListener);
    addListener(
      doc,
      `${eventTypePrefix}move`,
      this._onMouseMove as EventListener,
      addEventOptions,
    );
  }

  /**
   * @private
   * @param {Event} e Event object fired on mousedown
   */
  _onTouchEnd(e: TouchEvent) {
    if (e.touches.length > 0) {
      // if there are still touches stop here
      return;
    }
    this.__onMouseUp(e);
    this._resetTransformEventData();
    delete this.mainTouchId;
    const eventTypePrefix = this._getEventPrefix();
    const doc = getDocumentFromElement(this.upperCanvasEl);
    removeListener(
      doc,
      'touchend',
      this._onTouchEnd as EventListener,
      addEventOptions,
    );
    removeListener(
      doc,
      'touchmove',
      this._onMouseMove as EventListener,
      addEventOptions,
    );
    if (this._willAddMouseDown) {
      clearTimeout(this._willAddMouseDown);
    }
    this._willAddMouseDown = setTimeout(() => {
      // Wait 400ms before rebinding mousedown to prevent double triggers
      // from touch devices
      addListener(
        this.upperCanvasEl,
        `${eventTypePrefix}down`,
        this._onMouseDown as EventListener,
      );
      this._willAddMouseDown = 0;
    }, 400) as unknown as number;
  }

  /**
   * @private
   * @param {Event} e Event object fired on mouseup
   */
  _onMouseUp(e: TPointerEvent) {
    this.__onMouseUp(e);
    this._resetTransformEventData();
    const canvasElement = this.upperCanvasEl,
      eventTypePrefix = this._getEventPrefix();
    if (this._isMainEvent(e)) {
      const doc = getDocumentFromElement(this.upperCanvasEl);
      removeListener(
        doc,
        `${eventTypePrefix}up`,
        this._onMouseUp as EventListener,
      );
      removeListener(
        doc,
        `${eventTypePrefix}move`,
        this._onMouseMove as EventListener,
        addEventOptions,
      );
      addListener(
        canvasElement,
        `${eventTypePrefix}move`,
        this._onMouseMove as EventListener,
        addEventOptions,
      );
    }
  }

  /**
   * @private
   * @param {Event} e Event object fired on mousemove
   */
  _onMouseMove(e: TPointerEvent) {
    const activeObject = this.getActiveObject();
    !this.allowTouchScrolling &&
      (!activeObject ||
        // a drag event sequence is started by the active object flagging itself on mousedown / mousedown:before
        // we must not prevent the event's default behavior in order for the window to start dragging
        !activeObject.shouldStartDragging(e)) &&
      e.preventDefault &&
      e.preventDefault();
    this.__onMouseMove(e);
  }

  /**
   * @private
   */
  _onResize() {
    this.calcOffset();
    this._resetTransformEventData();
  }

  /**
   * Decides whether the canvas should be redrawn in mouseup and mousedown events.
   * @private
   * @param {Object} target
   */
  _shouldRender(target: FabricObject | undefined) {
    const activeObject = this.getActiveObject();
    // if just one of them is available or if they are both but are different objects
    // this covers: switch of target, from target to no target, selection of target
    // multiSelection with key and mouse
    return (
      !!activeObject !== !!target ||
      (activeObject && target && activeObject !== target)
    );
  }

  /**
   * 处理鼠标抬起事件的方法。
   * 该方法会根据当前的画布状态和鼠标事件执行不同的操作，
   * 例如完成当前变换、处理选择操作、调用控件的鼠标抬起处理程序等，
   * 最后根据情况渲染画布。
   *
   * @param {TPointerEvent} e - 触发的鼠标抬起事件对象。
   */
  __onMouseUp(e: TPointerEvent) {
    // 缓存事件处理过程中所需的常见信息
    this._cacheTransformEventData(e);
    // 触发 'up:before' 事件
    this._handleEvent(e, 'up:before');

    // 获取当前的变换对象
    const transform = this._currentTransform;
    // 判断是否为点击操作
    const isClick = this._isClick;
    // 获取当前的目标对象
    const target = this._target;

    // 如果是右键或中键点击，仅触发事件并返回
    // 若 target 为 undefined，_handleEvent 会自动查找目标对象
    const { button } = e as MouseEvent;
    if (button) {
      // 如果启用了中键点击事件且按下的是中键，或者启用了右键点击事件且按下的是右键
      ((this.fireMiddleClick && button === 1) ||
        (this.fireRightClick && button === 2)) &&
        // 触发 'up' 事件
        this._handleEvent(e, 'up');
      // 重置事件处理过程中缓存的变换数据
      this._resetTransformEventData();
      return;
    }

    // 如果处于绘图模式且正在绘图
    if (this.isDrawingMode && this._isCurrentlyDrawing) {
      // 调用绘图模式下的鼠标抬起处理方法
      this._onMouseUpInDrawingMode(e);
      return;
    }

    // 如果当前事件不是主事件，则不进行后续处理
    if (!this._isMainEvent(e)) {
      return;
    }
    // 标记是否需要渲染画布
    let shouldRender = false;
    // 如果存在变换操作
    if (transform) {
      // 完成当前的变换操作
      this._finalizeCurrentTransform(e);
      // 根据变换操作是否执行来决定是否需要渲染画布
      shouldRender = transform.actionPerformed;
    }
    // 如果不是点击操作
    if (!isClick) {
      // 标记目标对象之前是否为活动对象
      const targetWasActive = target === this._activeObject;
      // 处理选择操作
      this.handleSelection(e);
      // 如果之前不需要渲染画布
      if (!shouldRender) {
        // 根据目标对象的状态和选择情况决定是否需要渲染画布
        shouldRender =
          this._shouldRender(target) ||
          (!targetWasActive && target === this._activeObject);
      }
    }
    // 定义指针和角点变量
    let pointer, corner;
    // 如果存在目标对象
    if (target) {
      // 在目标对象上查找当前鼠标位置对应的控件
      const found = target.findControl(
        this.getViewportPoint(e),
        isTouchEvent(e),
      );
      // 解构获取控件的键和控件对象
      const { key, control } = found || {};
      // 记录角点信息
      corner = key;
      // 如果目标对象可选择，不是当前活动对象，且激活条件为鼠标抬起
      if (
        target.selectable &&
        target !== this._activeObject &&
        target.activeOn === 'up'
      ) {
        // 设置目标对象为活动对象
        this.setActiveObject(target, e);
        // 标记需要渲染画布
        shouldRender = true;
      }
      // 如果找到对应的控件
      else if (control) {
        // 获取控件的鼠标抬起处理程序
        const mouseUpHandler = control.getMouseUpHandler(e, target, control);
        if (mouseUpHandler) {
          // 获取鼠标在场景中的位置
          pointer = this.getScenePoint(e);
          // 调用鼠标抬起处理程序
          mouseUpHandler.call(control, e, transform!, pointer.x, pointer.y);
        }
      }
      // 标记目标对象停止移动
      target.isMoving = false;
    }
    // 如果结束变换时，目标对象或角点发生了变化
    if (
      transform &&
      (transform.target !== target || transform.corner !== corner)
    ) {
      // 获取原始变换的控件对象
      const originalControl =
        transform.target && transform.target.controls[transform.corner],
        // 获取原始控件的鼠标抬起处理程序
        originalMouseUpHandler =
          originalControl &&
          originalControl.getMouseUpHandler(
            e,
            transform.target,
            originalControl,
          );
      // 获取鼠标在场景中的位置
      pointer = pointer || this.getScenePoint(e);
      // 如果存在原始鼠标抬起处理程序，则调用该程序
      originalMouseUpHandler &&
        originalMouseUpHandler.call(
          originalControl,
          e,
          transform,
          pointer.x,
          pointer.y,
        );
    }
    // 根据鼠标事件和目标对象设置光标样式
    this._setCursorFromEvent(e, target);
    // 触发 'up' 事件
    this._handleEvent(e, 'up');
    // 清空多选框选择器
    this._groupSelector = null;
    // 清空当前的变换对象
    this._currentTransform = null;
    // 重置目标对象的角点选择信息
    target && (target.__corner = undefined);
    // 如果需要渲染画布
    if (shouldRender) {
      // 请求渲染整个画布
      this.requestRenderAll();
    }
    // 如果不是点击操作，且活动对象不是正在编辑的文本对象
    else if (!isClick && !(this._activeObject as IText)?.isEditing) {
      // 仅渲染顶部画布
      this.renderTop();
    }
  }

  _basicEventHandler<T extends keyof (CanvasEvents | ObjectEvents)>(
    eventType: T,
    options: (CanvasEvents & ObjectEvents)[T],
  ) {
    const { target, subTargets = [] } = options as {
      target?: FabricObject;
      subTargets: FabricObject[];
    };
    this.fire(eventType, options);
    target && target.fire(eventType, options);
    for (let i = 0; i < subTargets.length; i++) {
      subTargets[i] !== target && subTargets[i].fire(eventType, options);
    }
    return options;
  }

  /**
   * @private
   * Handle event firing for target and subtargets
   * @param {TPointerEvent} e event from mouse
   * @param {TPointerEventNames} eventType
   */
  _handleEvent<T extends TPointerEventNames>(e: TPointerEvent, eventType: T) {
    const target = this._target,
      targets = this.targets || [],
      options: CanvasEvents[`mouse:${T}`] = {
        e,
        target,
        subTargets: targets,
        ...getEventPoints(this, e),
        transform: this._currentTransform,
        ...(eventType === 'up:before' || eventType === 'up'
          ? {
            isClick: this._isClick,
            currentTarget: this.findTarget(e),
            // set by the preceding `findTarget` call
            currentSubTargets: this.targets,
          }
          : {}),
      } as CanvasEvents[`mouse:${T}`];
    this.fire(`mouse:${eventType}`, options);
    // this may be a little be more complicated of what we want to handle
    target && target.fire(`mouse${eventType}`, options);
    for (let i = 0; i < targets.length; i++) {
      targets[i] !== target && targets[i].fire(`mouse${eventType}`, options);
    }
  }

  /**
   * @private
   * @param {Event} e Event object fired on mousedown
   */
  _onMouseDownInDrawingMode(e: TPointerEvent) {
    this._isCurrentlyDrawing = true;
    if (this.getActiveObject()) {
      this.discardActiveObject(e);
      this.requestRenderAll();
    }
    // TODO: this is a scene point so it should be renamed
    const pointer = this.getScenePoint(e);
    this.freeDrawingBrush &&
      this.freeDrawingBrush.onMouseDown(pointer, { e, pointer });
    this._handleEvent(e, 'down');
  }

  /**
   * @private
   * @param {Event} e Event object fired on mousemove
   */
  _onMouseMoveInDrawingMode(e: TPointerEvent) {
    if (this._isCurrentlyDrawing) {
      const pointer = this.getScenePoint(e);
      this.freeDrawingBrush &&
        this.freeDrawingBrush.onMouseMove(pointer, {
          e,
          // this is an absolute pointer, the naming is wrong
          pointer,
        });
    }
    this.setCursor(this.freeDrawingCursor);
    this._handleEvent(e, 'move');
  }

  /**
   * @private
   * @param {Event} e Event object fired on mouseup
   */
  _onMouseUpInDrawingMode(e: TPointerEvent) {
    const pointer = this.getScenePoint(e);
    if (this.freeDrawingBrush) {
      this._isCurrentlyDrawing = !!this.freeDrawingBrush.onMouseUp({
        e: e,
        // this is an absolute pointer, the naming is wrong
        pointer,
      });
    } else {
      this._isCurrentlyDrawing = false;
    }
    this._handleEvent(e, 'up');
  }

  /**
   * 定义鼠标点击画布时的操作。
   * 该方法初始化当前变换参数并渲染整个画布，
   * 以便当前图像可以放置在顶部画布上，其余部分在容器画布上。
   * @private
   * @param {Event} e 触发的鼠标按下事件对象
   */
  __onMouseDown(e: TPointerEvent) {
    this._isClick = true; // 标记为点击事件
    this._cacheTransformEventData(e); // 缓存变换事件数据
    this._handleEvent(e, 'down:before'); // 触发事件前的处理

    const target: FabricObject | undefined = this._target; // 获取当前目标对象

    // 如果是右键或中键点击，仅触发事件
    const { button } = e as MouseEvent; // 获取鼠标按钮
    if (button) {
      ((this.fireMiddleClick && button === 1) || // 如果是中键点击
        (this.fireRightClick && button === 2)) && // 如果是右键点击
        this._handleEvent(e, 'down'); // 触发相应事件
      this._resetTransformEventData(); // 重置变换事件数据
      return; // 结束方法
    }

    if (this.isDrawingMode) { // 如果处于绘图模式
      this._onMouseDownInDrawingMode(e); // 处理绘图模式下的鼠标按下事件
      return; // 结束方法
    }

    if (!this._isMainEvent(e)) { // 检查是否为主要事件
      return; // 结束方法
    }

    // 忽略当前正在变换的对象
    if (this._currentTransform) {
      return; // 结束方法
    }

    let shouldRender = this._shouldRender(target); // 检查是否需要渲染
    let grouped = false; // 标记是否分组
    const ctrlKey = e.ctrlKey; // 检查是否按下 Ctrl 键
    const shiftKey = e.shiftKey; // 检查是否按下 Shift 键
    const parentIsActive = target && target.parent && isCollection(target.parent) && this._activeObjects?.includes(target.parent)
    if (target) { // 如果存在目标对象
      if (ctrlKey || shiftKey) { // 如果按下 Ctrl 键
        const isOnlyOneGroup = this._activeObjects?.filter((obj) => {
          return obj !== target.parent && !obj.parent
        }).length === 0
        if (target.parent && parentIsActive && isOnlyOneGroup) {
          this.checkboxActiveObjects(target)
        } else if (!parentIsActive || !isOnlyOneGroup || !target.parent) {
          shouldRender = true;
          this._activeObjects = this._activeObjects?.filter((obj) => !obj.parent)
          this.checkboxActiveObjects(target.parent || target)
        }
      } else {
        if (target.parent) {
          if (parentIsActive) {
            this._activeObjects = [target.parent, target]
          } else {
            this._activeObjects = [target.parent]
          }
        } else {
          this._activeObjects = [target]; // 否则将当前目标设置为活动对象
        }
      }
    } else {
      this._activeObjects = []; // 如果没有目标，清空活动对象
    }

    if (this.handleMultiSelection(e, target) || parentIsActive) { // 处理多选
      // target = this._activeObject; // 更新目标为当前活动对象
      grouped = true; // 标记为分组
      shouldRender = true; // 设置需要渲染
    } else if (this._shouldClearSelection(e, target)) { // 检查是否需要清除选择
      this.discardActiveObject(e); // 清除活动对象
    }

    // 如果启用了选择并且没有目标，或者满足以下条件：
    // 目标不可选择、目标未编辑、目标未被选中，则开始绘制选择框
    if (
      this.selection &&
      (!target ||
        (!target.selectable &&
          !(target as IText).isEditing &&
          target !== this._activeObject))
    ) {
      const p = this.getScenePoint(e); // 获取鼠标在场景中的位置
      this._groupSelector = { // 设置选择框
        x: p.x,
        y: p.y,
        deltaY: 0,
        deltaX: 0,
      };
    }

    if (target) { // 如果存在目标对象
      const alreadySelected = target === this._activeObject; // 检查目标是否已被选中
      if (target.selectable && target.activeOn === 'down') { // 如果目标可选择并在按下时激活
        this.setActiveObject(target, e); // 设置当前活动对象
      }
      const handle = target.findControl( // 查找控制点
        this.getViewportPoint(e),
        isTouchEvent(e),
      );
      if (target === this._activeObject && (handle || !grouped)) { // 如果目标是当前活动对象且有控制点或未分组
        this._setupCurrentTransform(e, target, alreadySelected); // 设置当前变换
        const control = handle ? handle.control : undefined,
          pointer = this.getScenePoint(e), // 获取鼠标在场景中的位置
          mouseDownHandler =
            control && control.getMouseDownHandler(e, target, control); // 获取鼠标按下处理函数
        mouseDownHandler &&
          mouseDownHandler.call(
            control,
            e,
            this._currentTransform!,
            pointer.x,
            pointer.y,
          ); // 调用鼠标按下处理函数
      }
    }

    // 清空 `_objectsToRender` 以便在渲染时重新填充
    // 在触发 `down` 事件之前运行，以便开发者有机会自己填充
    shouldRender && (this._objectsToRender = undefined);
    this._handleEvent(e, 'down'); // 触发鼠标按下事件
    // 必须渲染所有内容以更新视觉效果
    shouldRender && this.requestRenderAll(); // 请求重新渲染所有内容
  }

  checkboxActiveObjects(target: FabricObject) {
    if (!this._activeObjects) { // 如果没有活动对象
      this._activeObjects = [target]; // 设置当前目标为活动对象
      return;
    }
    if (this._activeObjects?.includes(target)) { // 如果目标已在活动对象中
      this._activeObjects.splice(this._activeObjects.indexOf(target), 1); // 从活动对象中移除
    } else {
      this._activeObjects.push(target); // 否则添加到活动对象中
    }
  }

  /**
   * reset cache form common information needed during event processing
   * @private
   */
  _resetTransformEventData() {
    this._target = this._pointer = this._absolutePointer = undefined;
  }

  /**
  * 缓存事件处理过程中所需的常见信息
  * @private
  * @param {Event} e 触发事件的事件对象
  */
  _cacheTransformEventData(e: TPointerEvent) {
    // 重置以避免过时的缓存
    this._resetTransformEventData(); // 调用重置方法清空之前的缓存数据
    this._pointer = this.getViewportPoint(e); // 获取鼠标在视口中的位置并缓存
    this._absolutePointer = sendPointToPlane( // 将视口坐标转换为绝对坐标
      this._pointer,
      undefined,
      this.viewportTransform, // 使用当前的视口变换
    );
    this._target = this._currentTransform // 如果当前有变换，获取目标对象
      ? this._currentTransform.target
      : this.findTarget(e); // 否则查找当前事件的目标对象
  }

  /**
   * 处理鼠标移动事件的方法。
   * 该方法会根据当前的画布状态和鼠标位置执行不同的操作，
   * 例如在绘图模式下处理鼠标移动、绘制多选框、设置光标样式、触发对象变换等。
   *
   * @param {TPointerEvent} e - 触发的鼠标移动事件对象。
   */
  __onMouseMove(e: TPointerEvent) {
    // 标记当前操作不是点击操作
    this._isClick = false;
    // 缓存事件处理过程中所需的常见信息
    this._cacheTransformEventData(e);
    // 触发 'move:before' 事件
    this._handleEvent(e, 'move:before');

    // 如果处于绘图模式
    if (this.isDrawingMode) {
      // 调用绘图模式下的鼠标移动处理方法
      this._onMouseMoveInDrawingMode(e);
      // 处理完绘图模式的鼠标移动后，直接返回
      return;
    }

    // 如果当前事件不是主事件，则不进行后续处理
    if (!this._isMainEvent(e)) {
      return;
    }

    // 获取多选框选择器对象
    const groupSelector = this._groupSelector;

    // 如果多选框选择器存在，说明最初点击在空白区域，需要绘制多选框
    if (groupSelector) {
      // 获取鼠标在场景中的位置
      const pointer = this.getScenePoint(e);

      // 计算多选框在 x 轴上的偏移量
      groupSelector.deltaX = pointer.x - groupSelector.x;
      // 计算多选框在 y 轴上的偏移量
      groupSelector.deltaY = pointer.y - groupSelector.y;

      // 渲染顶部画布
      this.renderTop();
    }
    // 如果当前没有正在进行的变换操作
    else if (!this._currentTransform) {
      // 查找鼠标下方的目标对象
      const target = this.findTarget(e);
      // 根据鼠标事件和目标对象设置光标样式
      this._setCursorFromEvent(e, target);
      // 触发目标对象的鼠标悬停和移出事件
      this._fireOverOutEvents(e, target);
    }
    // 如果正在进行变换操作
    else {
      // 对对象进行变换操作
      this._transformObject(e);
    }
    // 调用文本编辑管理器的鼠标移动处理方法
    this.textEditingManager.onMouseMove(e);
    // 触发 'move' 事件
    this._handleEvent(e, 'move');
    // 重置事件处理过程中缓存的变换数据
    this._resetTransformEventData();
  }

  /**
   * Manage the mouseout, mouseover events for the fabric object on the canvas
   * @param {Fabric.Object} target the target where the target from the mousemove event
   * @param {Event} e Event object fired on mousemove
   * @private
   */
  _fireOverOutEvents(e: TPointerEvent, target?: FabricObject) {
    const _hoveredTarget = this._hoveredTarget,
      _hoveredTargets = this._hoveredTargets,
      targets = this.targets,
      length = Math.max(_hoveredTargets.length, targets.length);

    this.fireSyntheticInOutEvents('mouse', {
      e,
      target,
      oldTarget: _hoveredTarget,
      fireCanvas: true,
    });
    for (let i = 0; i < length; i++) {
      this.fireSyntheticInOutEvents('mouse', {
        e,
        target: targets[i],
        oldTarget: _hoveredTargets[i],
      });
    }
    this._hoveredTarget = target;
    this._hoveredTargets = this.targets.concat();
  }

  /**
   * Manage the dragEnter, dragLeave events for the fabric objects on the canvas
   * @param {Fabric.Object} target the target where the target from the onDrag event
   * @param {Object} data Event object fired on dragover
   * @private
   */
  _fireEnterLeaveEvents(target: FabricObject | undefined, data: DragEventData) {
    const draggedoverTarget = this._draggedoverTarget,
      _hoveredTargets = this._hoveredTargets,
      targets = this.targets,
      length = Math.max(_hoveredTargets.length, targets.length);

    this.fireSyntheticInOutEvents('drag', {
      ...data,
      target,
      oldTarget: draggedoverTarget,
      fireCanvas: true,
    });
    for (let i = 0; i < length; i++) {
      this.fireSyntheticInOutEvents('drag', {
        ...data,
        target: targets[i],
        oldTarget: _hoveredTargets[i],
      });
    }
    this._draggedoverTarget = target;
  }

  /**
   * Manage the synthetic in/out events for the fabric objects on the canvas
   * @param {Fabric.Object} target the target where the target from the supported events
   * @param {Object} data Event object fired
   * @param {Object} config configuration for the function to work
   * @param {String} config.targetName property on the canvas where the old target is stored
   * @param {String} [config.canvasEvtOut] name of the event to fire at canvas level for out
   * @param {String} config.evtOut name of the event to fire for out
   * @param {String} [config.canvasEvtIn] name of the event to fire at canvas level for in
   * @param {String} config.evtIn name of the event to fire for in
   * @private
   */
  fireSyntheticInOutEvents<T extends keyof TSyntheticEventContext>(
    type: T,
    {
      target,
      oldTarget,
      fireCanvas,
      e,
      ...data
    }: TSyntheticEventContext[T] & {
      target?: FabricObject;
      oldTarget?: FabricObject;
      fireCanvas?: boolean;
    },
  ) {
    const { targetIn, targetOut, canvasIn, canvasOut } =
      syntheticEventConfig[type];
    const targetChanged = oldTarget !== target;

    if (oldTarget && targetChanged) {
      const outOpt: CanvasEvents[typeof canvasOut] = {
        ...data,
        e,
        target: oldTarget,
        nextTarget: target,
        ...getEventPoints(this, e),
      };
      fireCanvas && this.fire(canvasOut, outOpt);
      oldTarget.fire(targetOut, outOpt);
    }
    if (target && targetChanged) {
      const inOpt: CanvasEvents[typeof canvasIn] = {
        ...data,
        e,
        target,
        previousTarget: oldTarget,
        ...getEventPoints(this, e),
      };
      fireCanvas && this.fire(canvasIn, inOpt);
      target.fire(targetIn, inOpt);
    }
  }

  /**
   * Method that defines actions when an Event Mouse Wheel
   * @param {Event} e Event object fired on mouseup
   */
  __onMouseWheel(e: TPointerEvent) {
    this._cacheTransformEventData(e);
    this._handleEvent(e, 'wheel');
    this._resetTransformEventData();
  }

  /**
   * @private
   * @param {Event} e Event fired on mousemove
   */
  _transformObject(e: TPointerEvent) {
    const scenePoint = this.getScenePoint(e),
      transform = this._currentTransform!,
      target = transform.target,
      //  transform pointer to target's containing coordinate plane
      //  both pointer and object should agree on every point
      localPointer = target.group
        ? sendPointToPlane(
          scenePoint,
          undefined,
          target.group.calcTransformMatrix(),
        )
        : scenePoint;
    transform.shiftKey = e.shiftKey;
    transform.altKey = !!this.centeredKey && e[this.centeredKey];

    this._performTransformAction(e, transform, localPointer);
    transform.actionPerformed && this.requestRenderAll();
  }

  /**
   * @private
   */
  _performTransformAction(
    e: TPointerEvent,
    transform: Transform,
    pointer: Point,
  ) {
    const { action, actionHandler, target } = transform;

    const actionPerformed =
      !!actionHandler && actionHandler(e, transform, pointer.x, pointer.y);
    actionPerformed && target.setCoords();

    // this object could be created from the function in the control handlers
    if (action === 'drag' && actionPerformed) {
      transform.target.isMoving = true;
      this.setCursor(transform.target.moveCursor || this.moveCursor);
    }
    transform.actionPerformed = transform.actionPerformed || actionPerformed;
  }

  /**
   * Sets the cursor depending on where the canvas is being hovered.
   * Note: very buggy in Opera
   * @param {Event} e Event object
   * @param {Object} target Object that the mouse is hovering, if so.
   */
  _setCursorFromEvent(e: TPointerEvent, target?: FabricObject) {
    if (!target) {
      this.setCursor(this.defaultCursor);
      return;
    }
    let hoverCursor = target.hoverCursor || this.hoverCursor;
    const activeSelection = isActiveSelection(this._activeObject)
      ? this._activeObject
      : null,
      // only show proper corner when group selection is not active
      corner =
        (!activeSelection || target.group !== activeSelection) &&
        // here we call findTargetCorner always with undefined for the touch parameter.
        // we assume that if you are using a cursor you do not need to interact with
        // the bigger touch area.
        target.findControl(this.getViewportPoint(e));

    if (!corner) {
      if ((target as Group).subTargetCheck) {
        // hoverCursor should come from top-most subTarget,
        // so we walk the array backwards
        this.targets
          .concat()
          .reverse()
          .map((_target) => {
            hoverCursor = _target.hoverCursor || hoverCursor;
          });
      }
      this.setCursor(hoverCursor);
    } else {
      const control = corner.control;
      this.setCursor(control.cursorStyleHandler(e, control, target));
    }
  }

  /**
   * ## 处理多选
   * - 切换 `target` 的选择状态（如果未选中则选中，如果已选中则取消选中）
   * - 在未设置活动对象或活动选择中只剩下一个活动对象时，设置活动对象。
   * ---
   * - 如果活动对象是活动选择，我们从中添加/移除 `target`
   * - 如果不是，则将活动对象和 `target` 添加到活动选择中，并将其设置为活动对象。
   * @private
   * @param {TPointerEvent} e 事件对象
   * @param {FabricObject} target 要选择/取消选择的事件目标
   * @returns 如果发生分组操作，返回 true
   */
  protected handleMultiSelection(e: TPointerEvent, target?: FabricObject) {
    const activeObject = this._activeObject; // 获取当前活动对象
    const isAS = isActiveSelection(activeObject); // 检查活动对象是否是活动选择
    if (
      // 检查画布上是否存在活动对象，并且用户是否按下了 `selectionKey`，同时画布支持多选
      !!activeObject &&
      this._isSelectionKeyPressed(e) &&
      this.selection &&
      // 此外，用户还必须点击一个可选择的目标
      !!target &&
      target.selectable &&
      // 只有当目标对象和活动对象不同时才进行分组
      // 否则我们尝试查找 `ActiveSelection` 的子目标
      (activeObject !== target || isAS) &&
      // 确保 `activeObject` 和 `target` 不是彼此的祖先（如果 `activeObject` 不是 `ActiveSelection`）
      // 如果是 `ActiveSelection`，则我们希望从中移除 `target`
      (isAS ||
        (!target.isDescendantOf(activeObject) &&
          !activeObject.isDescendantOf(target)) &&
        // 目标接受选择
        !target.onSelect({ e }) &&
        // 确保我们没有点击控制点
        !activeObject.getActiveControl())
    ) {
      if (isAS) { // 如果活动对象是活动选择
        const prevActiveObjects = activeObject.getObjects(); // 获取活动选择中的所有对象
        if (target === activeObject) { // 如果目标是活动选择本身
          const pointer = this.getViewportPoint(e); // 获取指针位置
          target =
            // 首先在活动对象中查找要移除的目标
            this.searchPossibleTargets(prevActiveObjects, pointer) ||
            // 如果未找到，则在活动选择下查找要添加的目标
            // `prevActiveObjects` 会被搜索，但我们知道它们不会被找到
            this.searchPossibleTargets(this._objects, pointer);
          // 如果未找到任何目标，则退出
          if (!target || !target.selectable) {
            return false;
          }
        }
        if (target.group === activeObject) { // 如果目标是活动选择的一部分
          // 从活动选择中移除目标
          activeObject.remove(target);
          this._hoveredTarget = target; // 设置悬停目标
          this._hoveredTargets = [...this.targets]; // 设置悬停目标数组
          // 如果移除对象后只剩下一个对象
          if (activeObject.size() === 1) {
            // 激活最后一个剩余的对象
            // 取消选择活动选择将从中移除剩余的对象
            this._setActiveObject(activeObject.item(0), e);
          }
        } else {
          // 如果目标不是活动选择的一部分，则将其添加到活动选择中
          activeObject.multiSelectAdd(target);
          this._hoveredTarget = activeObject; // 设置悬停目标
          this._hoveredTargets = [...this.targets]; // 设置悬停目标数组
        }
        this._fireSelectionEvents(prevActiveObjects, e); // 触发选择事件
      } else { // 如果活动对象不是活动选择
        (activeObject as IText).isEditing &&
          (activeObject as IText).exitEditing(); // 如果活动对象是文本对象且正在编辑，则退出编辑模式
        // 将活动对象和目标添加到活动选择中，并将其设置为活动对象
        const klass =
          classRegistry.getClass<typeof ActiveSelection>('ActiveSelection'); // 获取活动选择类
        const newActiveSelection = new klass([], {
          // 在调用 `multiSelectAdd` 之前传递画布引用非常重要
          // 因为它使用 `FabricObject#isInFrontOf`，这依赖于画布引用
          canvas: this,
        });
        newActiveSelection.multiSelectAdd(activeObject, target); // 将活动对象和目标添加到新的活动选择中
        this._hoveredTarget = newActiveSelection; // 设置悬停目标
        // ISSUE 4115: 我们是否应该在这里考虑子目标？
        // this._hoveredTargets = [];
        // this._hoveredTargets = this.targets.concat();
        this._setActiveObject(newActiveSelection, e); // 设置新的活动选择为活动对象
        this._fireSelectionEvents([activeObject], e); // 触发选择事件
      }
      return true; // 返回 true 表示发生了分组操作
    }
    return false; // 返回 false 表示未发生分组操作
  }

  /**
   * ## Handles selection
   * - selects objects that are contained in (and possibly intersecting) the selection bounding box
   * - sets the active object
   * ---
   * runs on mouse up after a mouse move
   */
  protected handleSelection(e: TPointerEvent) {
    if (!this.selection || !this._groupSelector) {
      return false;
    }
    const { x, y, deltaX, deltaY } = this._groupSelector,
      point1 = new Point(x, y),
      point2 = point1.add(new Point(deltaX, deltaY)),
      tl = point1.min(point2),
      br = point1.max(point2),
      size = br.subtract(tl);

    const collectedObjects = this.collectObjects(
      {
        left: tl.x,
        top: tl.y,
        width: size.x,
        height: size.y,
      },
      { includeIntersecting: !this.selectionFullyContained },
    ) as FabricObject[];

    const objects =
      // though this method runs only after mouse move the pointer could do a mouse up on the same position as mouse down
      // should it be handled as is?
      point1.eq(point2)
        ? collectedObjects[0]
          ? [collectedObjects[0]]
          : []
        : collectedObjects.length > 1
          ? collectedObjects
            .filter((object) => !object.onSelect({ e }))
            .reverse()
          : // `setActiveObject` will call `onSelect(collectedObjects[0])` in this case
          collectedObjects;

    // set active object
    if (objects.length === 1) {
      // set as active object
      this.setActiveObject(objects[0], e);
    } else if (objects.length > 1) {
      // add to active selection and make it the active object
      const klass =
        classRegistry.getClass<typeof ActiveSelection>('ActiveSelection');
      this.setActiveObject(new klass(objects, { canvas: this }), e);
    }

    // cleanup
    this._groupSelector = null;
    return true;
  }

  /**
   * @override clear {@link textEditingManager}
   */
  clear() {
    this.textEditingManager.clear();
    super.clear();
  }

  /**
   * @override clear {@link textEditingManager}
   */
  destroy() {
    this.removeListeners();
    this.textEditingManager.dispose();
    super.destroy();
  }
}
