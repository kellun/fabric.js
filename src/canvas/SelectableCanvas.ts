import { dragHandler } from '../controls/drag';
import { getActionFromCorner } from '../controls/util';
import { Point } from '../Point';
import { FabricObject } from '../shapes/Object/FabricObject';
import type {
  CanvasEvents,
  ModifierKey,
  TOptionalModifierKey,
  TPointerEvent,
  Transform,
} from '../EventTypeDefs';
import {
  addTransformToObject,
  saveObjectTransform,
} from '../util/misc/objectTransforms';
import type { TCanvasSizeOptions } from './StaticCanvas';
import { StaticCanvas } from './StaticCanvas';
import { isCollection } from '../Collection';
import { isTransparent } from '../util/misc/isTransparent';
import type {
  TMat2D,
  TOriginX,
  TOriginY,
  TSize,
  TSVGReviver,
} from '../typedefs';
import { degreesToRadians } from '../util/misc/radiansDegreesConversion';
import { getPointer, isTouchEvent } from '../util/dom_event';
import type { IText } from '../shapes/IText/IText';
import type { BaseBrush } from '../brushes/BaseBrush';
import { pick } from '../util/misc/pick';
import { sendPointToPlane } from '../util/misc/planeChange';
import { cos, createCanvasElement, sin } from '../util';
import { CanvasDOMManager } from './DOMManagers/CanvasDOMManager';
import {
  BOTTOM,
  CENTER,
  LEFT,
  MODIFIED,
  RESIZING,
  RIGHT,
  ROTATE,
  SCALE,
  SCALE_X,
  SCALE_Y,
  SKEW_X,
  SKEW_Y,
  TOP,
} from '../constants';
import type { CanvasOptions } from './CanvasOptions';
import { canvasDefaults } from './CanvasOptions';
import { Intersection } from '../Intersection';
import { isActiveSelection } from '../util/typeAssertions';
import type { OlpShape } from '../shapes/Elements/OlpShape';

/**
 * Canvas class
 * @class Canvas
 * @extends StaticCanvas
 * @tutorial {@link http://fabricjs.com/fabric-intro-part-1#canvas}
 *
 * @fires object:modified at the end of a transform
 * @fires object:rotating while an object is being rotated from the control
 * @fires object:scaling while an object is being scaled by controls
 * @fires object:moving while an object is being dragged
 * @fires object:skewing while an object is being skewed from the controls
 *
 * @fires before:transform before a transform is is started
 * @fires before:selection:cleared
 * @fires selection:cleared
 * @fires selection:updated
 * @fires selection:created
 *
 * @fires path:created after a drawing operation ends and the path is added
 * @fires mouse:down
 * @fires mouse:move
 * @fires mouse:up
 * @fires mouse:down:before  on mouse down, before the inner fabric logic runs
 * @fires mouse:move:before on mouse move, before the inner fabric logic runs
 * @fires mouse:up:before on mouse up, before the inner fabric logic runs
 * @fires mouse:over
 * @fires mouse:out
 * @fires mouse:dblclick whenever a native dbl click event fires on the canvas.
 *
 * @fires dragover
 * @fires dragenter
 * @fires dragleave
 * @fires drag:enter object drag enter
 * @fires drag:leave object drag leave
 * @fires drop:before before drop event. Prepare for the drop event (same native event).
 * @fires drop
 * @fires drop:after after drop event. Run logic on canvas after event has been accepted/declined (same native event).
 * @example
 * let a: fabric.Object, b: fabric.Object;
 * let flag = false;
 * canvas.add(a, b);
 * a.on('drop:before', opt => {
 *  //  we want a to accept the drop even though it's below b in the stack
 *  flag = this.canDrop(opt.e);
 * });
 * b.canDrop = function(e) {
 *  !flag && this.draggableTextDelegate.canDrop(e);
 * }
 * b.on('dragover', opt => b.set('fill', opt.dropTarget === b ? 'pink' : 'black'));
 * a.on('drop', opt => {
 *  opt.e.defaultPrevented  //  drop occurred
 *  opt.didDrop             //  drop occurred on canvas
 *  opt.target              //  drop target
 *  opt.target !== a && a.set('text', 'I lost');
 * });
 * canvas.on('drop:after', opt => {
 *  //  inform user who won
 *  if(!opt.e.defaultPrevented) {
 *    // no winners
 *  }
 *  else if(!opt.didDrop) {
 *    //  my objects didn't win, some other lucky object
 *  }
 *  else {
 *    //  we have a winner it's opt.target!!
 *  }
 * })
 *
 * @fires after:render at the end of the render process, receives the context in the callback
 * @fires before:render at start the render process, receives the context in the callback
 *
 * @fires contextmenu:before
 * @fires contextmenu
 * @example
 * let handler;
 * targets.forEach(target => {
 *   target.on('contextmenu:before', opt => {
 *     //  decide which target should handle the event before canvas hijacks it
 *     if (someCaseHappens && opt.targets.includes(target)) {
 *       handler = target;
 *     }
 *   });
 *   target.on('contextmenu', opt => {
 *     //  do something fantastic
 *   });
 * });
 * canvas.on('contextmenu', opt => {
 *   if (!handler) {
 *     //  no one takes responsibility, it's always left to me
 *     //  let's show them how it's done!
 *   }
 * });
 *
 */
export class SelectableCanvas<EventSpec extends CanvasEvents = CanvasEvents>
  extends StaticCanvas<EventSpec>
  implements Omit<CanvasOptions, 'enablePointerEvents'> {
  declare _objects: FabricObject[];

  // transform config
  declare uniformScaling: boolean;
  declare uniScaleKey: TOptionalModifierKey;
  declare centeredScaling: boolean;
  declare centeredRotation: boolean;
  declare centeredKey: TOptionalModifierKey;
  declare altActionKey: TOptionalModifierKey;

  // selection config
  declare selection: boolean;
  declare selectionKey: TOptionalModifierKey | ModifierKey[];
  declare altSelectionKey: TOptionalModifierKey;
  declare selectionColor: string;
  declare selectionDashArray: number[];
  declare selectionBorderColor: string;
  declare selectionLineWidth: number;
  declare selectionFullyContained: boolean;

  // cursors
  declare hoverCursor: CSSStyleDeclaration['cursor'];
  declare moveCursor: CSSStyleDeclaration['cursor'];
  declare defaultCursor: CSSStyleDeclaration['cursor'];
  declare freeDrawingCursor: CSSStyleDeclaration['cursor'];
  declare notAllowedCursor: CSSStyleDeclaration['cursor'];

  declare containerClass: string;

  // target find config
  declare perPixelTargetFind: boolean;
  declare targetFindTolerance: number;
  declare skipTargetFind: boolean;

  /**
   * When true, mouse events on canvas (mousedown/mousemove/mouseup) result in free drawing.
   * After mousedown, mousemove creates a shape,
   * and then mouseup finalizes it and adds an instance of `fabric.Path` onto canvas.
   * @tutorial {@link http://fabricjs.com/fabric-intro-part-4#free_drawing}
   * @type Boolean
   * @default
   */
  declare isDrawingMode: boolean;

  declare preserveObjectStacking: boolean;

  // event config
  declare stopContextMenu: boolean;
  declare fireRightClick: boolean;
  declare fireMiddleClick: boolean;

  /**
   * 用于跟踪鼠标事件的子目标数组，从最内层的嵌套子目标开始，自底向上排序。
   * 在鼠标事件处理过程中，用于存储所有可能的目标对象，包括嵌套对象。
   * 例如：当鼠标悬停在一个组内的对象时，会记录该对象及其所有父组。
   * @type {FabricObject[]}
   */
  targets: FabricObject[] = [];


  /**
   * Keep track of the hovered target
   * @type FabricObject | null
   * @private
   */
  declare _hoveredTarget?: FabricObject;

  /**
   * hold the list of nested targets hovered
   * @type FabricObject[]
   * @private
   */
  _hoveredTargets: FabricObject[] = [];

  /**
   * hold the list of objects to render
   * @type FabricObject[]
   * @private
   */
  _objectsToRender?: FabricObject[];

  /**
   * hold a reference to a data structure that contains information
   * on the current on going transform
   * @type
   * @private
   */
  _currentTransform: Transform | null = null;

  /**
   * hold a reference to a data structure used to track the selection
   * box on canvas drag
   * on the current on going transform
   * x, y, deltaX and deltaY are in scene plane
   * @type
   * @private
   */
  protected _groupSelector: {
    x: number;
    y: number;
    deltaX: number;
    deltaY: number;
  } | null = null;

  /**
   * internal flag used to understand if the context top requires a cleanup
   * in case this is true, the contextTop will be cleared at the next render
   * @type boolean
   * @private
   */
  contextTopDirty = false;

  /**
   * During a mouse event we may need the pointer multiple times in multiple functions.
   * _absolutePointer holds a reference to the pointer in fabricCanvas/design coordinates that is valid for the event
   * lifespan. Every fabricJS mouse event create and delete the cache every time
   * We do this because there are some HTML DOM inspection functions to get the actual pointer coordinates
   * @type {Point}
   */
  protected declare _absolutePointer?: Point;

  /**
   * During a mouse event we may need the pointer multiple times in multiple functions.
   * _pointer holds a reference to the pointer in html coordinates that is valid for the event
   * lifespan. Every fabricJS mouse event create and delete the cache every time
   * We do this because there are some HTML DOM inspection functions to get the actual pointer coordinates
   * @type {Point}
   */
  protected declare _pointer?: Point;

  /**
   * During a mouse event we may need the target multiple times in multiple functions.
   * _target holds a reference to the target that is valid for the event
   * lifespan. Every fabricJS mouse event create and delete the cache every time
   * @type {FabricObject}
   */
  protected declare _target?: FabricObject;

  static ownDefaults = canvasDefaults;

  static getDefaults(): Record<string, any> {
    return { ...super.getDefaults(), ...SelectableCanvas.ownDefaults };
  }

  declare elements: CanvasDOMManager;
  get upperCanvasEl() {
    return this.elements.upper?.el;
  }
  get contextTop() {
    return this.elements.upper?.ctx;
  }
  get wrapperEl() {
    return this.elements.container;
  }
  private declare pixelFindCanvasEl: HTMLCanvasElement;
  private declare pixelFindContext: CanvasRenderingContext2D;

  protected declare _isCurrentlyDrawing: boolean;
  declare freeDrawingBrush?: BaseBrush;
  declare _activeObject?: FabricObject;
  declare _activeObjects?: FabricObject[];

  protected initElements(el?: string | HTMLCanvasElement) {
    this.elements = new CanvasDOMManager(el, {
      allowTouchScrolling: this.allowTouchScrolling,
      containerClass: this.containerClass,
    });
    this._createCacheCanvas();
  }

  /**
   * @private
   * @param {FabricObject} obj Object that was added
   */
  _onObjectAdded(obj: FabricObject) {
    this._objectsToRender = undefined;
    super._onObjectAdded(obj);
  }

  /**
   * @private
   * @param {FabricObject} obj Object that was removed
   */
  _onObjectRemoved(obj: FabricObject) {
    this._objectsToRender = undefined;
    // removing active object should fire "selection:cleared" events
    if (obj === this._activeObject) {
      this.fire('before:selection:cleared', { deselected: [obj] });
      this._discardActiveObject();
      this.fire('selection:cleared', { deselected: [obj] });
      obj.fire('deselected', {
        target: obj,
      });
    }
    if (obj === this._hoveredTarget) {
      this._hoveredTarget = undefined;
      this._hoveredTargets = [];
    }
    super._onObjectRemoved(obj);
  }

  _onStackOrderChanged() {
    this._objectsToRender = undefined;
    super._onStackOrderChanged();
  }

  /**
   * Divides objects in two groups, one to render immediately
   * and one to render as activeGroup.
   * @return {Array} objects to render immediately and pushes the other in the activeGroup.
   */
  _chooseObjectsToRender(): FabricObject[] {
    const activeObject = this._activeObject;
    return !this.preserveObjectStacking && activeObject
      ? this._objects
        .filter((object) => !object.group && object !== activeObject)
        .concat(activeObject)
      : this._objects;
  }

  /**
   * Renders both the top canvas and the secondary container canvas.
   */
  renderAll() {
    this.cancelRequestedRender();
    if (this.destroyed) {
      return;
    }
    if (this.contextTopDirty && !this._groupSelector && !this.isDrawingMode) {
      this.clearContext(this.contextTop);
      this.contextTopDirty = false;
    }
    if (this.hasLostContext) {
      this.renderTopLayer(this.contextTop);
      this.hasLostContext = false;
    }
    !this._objectsToRender &&
      (this._objectsToRender = this._chooseObjectsToRender());
    this.renderCanvas(this.getContext(), this._objectsToRender);
  }

  /**
   * text selection is rendered by the active text instance during the rendering cycle
   */
  renderTopLayer(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    if (this.isDrawingMode && this._isCurrentlyDrawing) {
      this.freeDrawingBrush && this.freeDrawingBrush._render();
      this.contextTopDirty = true;
    }
    // we render the top context - last object
    if (this.selection && this._groupSelector) {
      this._drawSelection(ctx);
      this.contextTopDirty = true;
    }
    ctx.restore();
  }

  /**
   * Method to render only the top canvas.
   * Also used to render the group selection box.
   * Does not render text selection.
   */
  renderTop() {
    const ctx = this.contextTop;
    this.clearContext(ctx);
    this.renderTopLayer(ctx);
    // todo: how do i know if the after:render is for the top or normal contex?
    this.fire('after:render', { ctx });
  }

  /**
   * Set the canvas tolerance value for pixel taret find.
   * Use only integer numbers.
   * @private
   */
  setTargetFindTolerance(value: number) {
    value = Math.round(value);
    this.targetFindTolerance = value;
    const retina = this.getRetinaScaling();
    const size = Math.ceil((value * 2 + 1) * retina);
    this.pixelFindCanvasEl.width = this.pixelFindCanvasEl.height = size;
    this.pixelFindContext.scale(retina, retina);
  }

  /**
   * Returns true if object is transparent at a certain location
   * Clarification: this is `is target transparent at location X or are controls there`
   * @TODO this seems dumb that we treat controls with transparency. we can find controls
   * programmatically without painting them, the cache canvas optimization is always valid
   * @param {FabricObject} target Object to check
   * @param {Number} x Left coordinate in viewport space
   * @param {Number} y Top coordinate in viewport space
   * @return {Boolean}
   */
  isTargetTransparent(target: FabricObject, x: number, y: number): boolean {
    const tolerance = this.targetFindTolerance;
    const ctx = this.pixelFindContext;
    this.clearContext(ctx);
    ctx.save();
    ctx.translate(-x + tolerance, -y + tolerance);
    ctx.transform(...this.viewportTransform);
    const selectionBgc = target.selectionBackgroundColor;
    target.selectionBackgroundColor = '';
    target.render(ctx);
    target.selectionBackgroundColor = selectionBgc;
    ctx.restore();
    // our canvas is square, and made around tolerance.
    // so tolerance in this case also represent the center of the canvas.
    const enhancedTolerance = Math.round(tolerance * this.getRetinaScaling());
    return isTransparent(
      ctx,
      enhancedTolerance,
      enhancedTolerance,
      enhancedTolerance,
    );
  }

  /**
   * takes an event and determines if selection key has been pressed
   * @private
   * @param {TPointerEvent} e Event object
   */
  _isSelectionKeyPressed(e: TPointerEvent): boolean {
    const sKey = this.selectionKey;
    if (!sKey) {
      return false;
    }
    if (Array.isArray(sKey)) {
      return !!sKey.find((key) => !!key && e[key] === true);
    } else {
      return e[sKey];
    }
  }

  /**
   * @private
   * @param {TPointerEvent} e Event object
   * @param {FabricObject} target
   */
  _shouldClearSelection(
    e: TPointerEvent,
    target?: FabricObject,
  ): target is undefined {
    const activeObjects = this.getActiveObjects(),
      activeObject = this._activeObject;

    return !!(
      !target ||
      (target &&
        activeObject &&
        activeObjects.length > 1 &&
        activeObjects.indexOf(target) === -1 &&
        activeObject !== target &&
        !this._isSelectionKeyPressed(e)) ||
      (target && !target.evented) ||
      (target && !target.selectable && activeObject && activeObject !== target)
    );
  }

  /**
   * This method will take in consideration a modifier key pressed and the control we are
   * about to drag, and try to guess the anchor point ( origin ) of the transormation.
   * This should be really in the realm of controls, and we should remove specific code for legacy
   * embedded actions.
   * @TODO this probably deserve discussion/rediscovery and change/refactor
   * @private
   * @deprecated
   * @param {FabricObject} target
   * @param {string} action
   * @param {boolean} altKey
   * @returns {boolean} true if the transformation should be centered
   */
  private _shouldCenterTransform(
    target: FabricObject,
    action: string,
    modifierKeyPressed: boolean,
  ) {
    if (!target) {
      return;
    }

    let centerTransform;

    if (
      action === SCALE ||
      action === SCALE_X ||
      action === SCALE_Y ||
      action === RESIZING
    ) {
      centerTransform = this.centeredScaling || target.centeredScaling;
    } else if (action === ROTATE) {
      centerTransform = this.centeredRotation || target.centeredRotation;
    }

    return centerTransform ? !modifierKeyPressed : modifierKeyPressed;
  }

  /**
   * Given the control clicked, determine the origin of the transform.
   * This is bad because controls can totally have custom names
   * should disappear before release 4.0
   * @private
   * @deprecated
   */
  _getOriginFromCorner(
    target: FabricObject,
    controlName: string,
  ): { x: TOriginX; y: TOriginY } {
    const origin = {
      x: target.originX,
      y: target.originY,
    };

    if (!controlName) {
      return origin;
    }

    // is a left control ?
    if (['ml', 'tl', 'bl'].includes(controlName)) {
      origin.x = RIGHT;
      // is a right control ?
    } else if (['mr', 'tr', 'br'].includes(controlName)) {
      origin.x = LEFT;
    }
    // is a top control ?
    if (['tl', 'mt', 'tr'].includes(controlName)) {
      origin.y = BOTTOM;
      // is a bottom control ?
    } else if (['bl', 'mb', 'br'].includes(controlName)) {
      origin.y = TOP;
    }
    return origin;
  }

  /**
   * @private
   * @param {Event} e 事件对象
   * @param {FabricObject} target 目标对象
   * @param {boolean} [alreadySelected] 如果为 true，则设置活动控制
   */
  _setupCurrentTransform(
    e: TPointerEvent,
    target: FabricObject,
    alreadySelected: boolean,
  ): void {
    const pointer = target.group
      ? // 将指针转换为目标的包含坐标平面
      sendPointToPlane(
        this.getScenePoint(e),
        undefined,
        target.group.calcTransformMatrix(),
      )
      : this.getScenePoint(e); // 获取场景中的指针位置

    const { key: corner = '', control } = target.getActiveControl() || {}, // 获取活动控制点
      actionHandler =
        alreadySelected && control
          ? control.getActionHandler(e, target, control)?.bind(control) // 获取控制点的动作处理函数
          : dragHandler, // 默认使用拖动处理函数
      action = getActionFromCorner(alreadySelected, corner, e, target), // 获取动作类型
      altKey = e[this.centeredKey as ModifierKey], // 获取 Alt 键状态
      origin = this._shouldCenterTransform(target, action, altKey)
        ? ({ x: CENTER, y: CENTER } as const) // 如果需要中心变换，设置原点为中心
        : this._getOriginFromCorner(target, corner), // 否则从控制点获取原点

      /**
       * 相对于目标的包含坐标平面
       * 两者在每个点上都一致
       **/
      transform: Transform = {
        target: target, // 目标对象
        action, // 动作类型
        actionHandler, // 动作处理函数
        actionPerformed: false, // 动作是否已执行
        corner, // 控制点
        scaleX: target.scaleX, // X 轴缩放
        scaleY: target.scaleY, // Y 轴缩放
        skewX: target.skewX, // X 轴倾斜
        skewY: target.skewY, // Y 轴倾斜
        offsetX: pointer.x - target.left, // X 轴偏移量
        offsetY: pointer.y - target.top, // Y 轴偏移量
        originX: origin.x, // 原点 X 坐标
        originY: origin.y, // 原点 Y 坐标
        ex: pointer.x, // 指针 X 坐标
        ey: pointer.y, // 指针 Y 坐标
        lastX: pointer.x, // 上一个 X 坐标
        lastY: pointer.y, // 上一个 Y 坐标
        theta: degreesToRadians(target.angle), // 目标角度（弧度）
        width: target.width, // 目标宽度
        height: target.height, // 目标高度
        shiftKey: e.shiftKey, // Shift 键状态
        altKey, // Alt 键状态
        original: {
          ...saveObjectTransform(target), // 保存目标的原始变换
          originX: origin.x, // 原点 X 坐标
          originY: origin.y, // 原点 Y 坐标
        },
      };

    this._currentTransform = transform; // 设置当前变换
    this.fire('before:transform', { // 触发变换前事件
      e,
      transform,
    });
  }

  /**
   * Set the cursor type of the canvas element
   * @param {String} value Cursor type of the canvas element.
   * @see http://www.w3.org/TR/css3-ui/#cursor
   */
  setCursor(value: CSSStyleDeclaration['cursor']): void {
    this.upperCanvasEl.style.cursor = value;
  }

  /**
   * @private
   * @param {CanvasRenderingContext2D} ctx to draw the selection on
   */
  _drawSelection(ctx: CanvasRenderingContext2D): void {
    const { x, y, deltaX, deltaY } = this._groupSelector!,
      start = new Point(x, y).transform(this.viewportTransform),
      extent = new Point(x + deltaX, y + deltaY).transform(
        this.viewportTransform,
      ),
      strokeOffset = this.selectionLineWidth / 2;
    let minX = Math.min(start.x, extent.x),
      minY = Math.min(start.y, extent.y),
      maxX = Math.max(start.x, extent.x),
      maxY = Math.max(start.y, extent.y);

    if (this.selectionColor) {
      ctx.fillStyle = this.selectionColor;
      ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
    }

    if (!this.selectionLineWidth || !this.selectionBorderColor) {
      return;
    }
    ctx.lineWidth = this.selectionLineWidth;
    ctx.strokeStyle = this.selectionBorderColor;

    minX += strokeOffset;
    minY += strokeOffset;
    maxX -= strokeOffset;
    maxY -= strokeOffset;
    // selection border
    // @TODO: is _setLineDash still necessary on modern canvas?
    FabricObject.prototype._setLineDash.call(
      this,
      ctx,
      this.selectionDashArray,
    );
    ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
  }

  /**
   * 方法用于确定我们点击的是哪个对象
   * 11/09/2018 TODO: 如果 findTarget 能够区分是完整目标还是角落的外部部分，那就太好了。
   * @param {Event} e 鼠标事件
   * @return {FabricObject | null} 找到的目标
   */
  findTarget(e: TPointerEvent): FabricObject | undefined {
    if (this.skipTargetFind) { // 如果跳过目标查找
      return undefined; // 返回未定义
    }

    // activeObject = this._activeObject, // 获取当前活动对象
    // aObjects = this.getActiveObjects(), // 获取所有活动对象
    const pointer = this.getViewportPoint(e), // 获取鼠标在视口中的位置
      activeObjects = this._activeObjects;

    this.targets = []; // 初始化目标数组
    // if (activeObject && aObjects.length >= 1) { // 如果有活动对象且活动对象数量大于等于1
    //   if (activeObject.findControl(pointer, isTouchEvent(e))) { // 检查鼠标是否点击了活动对象的控制点
    //     return activeObject; // 如果点击了控制点，返回活动对象
    //   } else if (
    //     aObjects.length > 1 &&
    //     // 检查鼠标指针是否在活动选择上，并可能执行 `subTargetCheck`
    //     this.searchPossibleTargets([activeObject], pointer)
    //   ) {
    //     return activeObject; // 如果活动选择中有多个对象，返回活动对象
    //   } else if (
    //     activeObject === this.searchPossibleTargets([activeObject], pointer)
    //   ) {
    //     // 如果活动对象不是活动选择
    //     if (!this.preserveObjectStacking) {
    //       return activeObject; // 如果不保留对象堆叠，返回活动对象
    //     } else {
    //       const subTargets = this.targets; // 保存当前目标
    //       this.targets = []; // 清空目标数组
    //       const target = this.searchPossibleTargets(this._objects, pointer); // 查找可能的目标
    //       if (
    //         e[this.altSelectionKey as ModifierKey] && // 如果按下了 alt 键
    //         target &&
    //         target !== activeObject
    //       ) {
    //         // alt 选择：即使活动对象不是最上面的目标，也选择活动对象
    //         this.targets = subTargets; // 恢复目标
    //         return activeObject; // 返回活动对象
    //       }
    //       return target; // 返回找到的目标
    //     }
    //   }
    // }
    if (activeObjects && activeObjects.length > 0) {
      for (let i = 0; i < activeObjects.length; i++) {
        const obj = activeObjects[i];
        if (obj.findControl(pointer, isTouchEvent(e))) {
          return obj;
        }
      }
    }

    return this.searchPossibleTargets(this._objects, pointer); // 查找所有对象中的可能目标
  }

  /**
   * Checks if the point is inside the object selection area including padding
   * @param {FabricObject} obj Object to test against
   * @param {Object} [pointer] point in scene coordinates
   * @return {Boolean} true if point is contained within an area of given object
   * @private
   */
  private _pointIsInObjectSelectionArea(obj: FabricObject, point: Point) {
    // getCoords will already take care of group de-nesting
    let coords = obj.getCoords();

    const isOlpShape = obj.get('type') === 'OlpShape'
    if (isOlpShape) {
      // 通过textboxCoords计算obj.textbox相对于canvas的坐标
      const textboxCoords = (obj as OlpShape).textbox.getCoords();

      // 获取obj的变换矩阵
      const objMatrix = obj.calcTransformMatrix();
      // 获取obj的父级变换矩阵（如果有的话）
      const parentMatrix = obj.group ? obj.group.calcTransformMatrix() : null;

      // 将textboxCoords从obj的局部坐标系转换到canvas的全局坐标系
      const canvasTextboxCoords = textboxCoords.map(tbPoint => {
        // 将textbox的坐标点转换为canvas的坐标点
        let point = new Point(tbPoint.x, tbPoint.y);
        // 应用obj的变换矩阵
        point = point.transform(objMatrix);
        // 如果有父级变换矩阵，继续应用
        if (parentMatrix) {
          point = point.transform(parentMatrix);
        }
        return point;
      });
      coords = canvasTextboxCoords;
    }
    const viewportZoom = this.getZoom();
    const padding = obj.padding / viewportZoom;
    if (padding) {
      const [tl, tr, br, bl] = coords;
      // what is the angle of the object?
      // we could use getTotalAngle, but is way easier to look at it
      // from how coords are oriented, since if something went wrong
      // at least we are consistent.
      const angleRadians = Math.atan2(tr.y - tl.y, tr.x - tl.x),
        cosP = cos(angleRadians) * padding,
        sinP = sin(angleRadians) * padding,
        cosPSinP = cosP + sinP,
        cosPMinusSinP = cosP - sinP;

      coords = [
        new Point(tl.x - cosPMinusSinP, tl.y - cosPSinP),
        new Point(tr.x + cosPSinP, tr.y - cosPMinusSinP),
        new Point(br.x + cosPMinusSinP, br.y + cosPSinP),
        new Point(bl.x - cosPSinP, bl.y + cosPMinusSinP),
      ];
      // in case of padding we calculate the new coords on the fly.
      // otherwise we have to maintain 2 sets of coordinates for everything.
      // we can reiterate on storing them.
      // if this is slow, for now the semplification is large and doesn't impact
      // rendering.
      // the idea behind this is that outside target check we don't need ot know
      // where those coords are
    }
    return Intersection.isPointInPolygon(point, coords);
  }

  /**
   * Checks point is inside the object selection condition. Either area with padding
   * or over pixels if perPixelTargetFind is enabled
   * @param {FabricObject} obj Object to test against
   * @param {Object} [pointer] point from viewport.
   * @return {Boolean} true if point is contained within an area of given object
   * @private
   */
  _checkTarget(obj: FabricObject, pointer: Point): boolean {
    if (
      obj &&
      obj.visible &&
      obj.evented &&
      this._pointIsInObjectSelectionArea(
        obj,
        sendPointToPlane(pointer, undefined, this.viewportTransform),
      )
    ) {
      if (
        (this.perPixelTargetFind || obj.perPixelTargetFind) &&
        !(obj as unknown as IText).isEditing
      ) {
        if (!this.isTargetTransparent(obj, pointer.x, pointer.y)) {
          return true;
        }
      } else {
        return true;
      }
    }
    return false;
  }

  /**
   * 内部函数，用于在对象数组中查找包含指针的对象（在边界框内或绘制时包含 pointerOnCanvas）
   * @param {Array} [objects] 要查找的对象数组
   * @param {Object} [pointer] 要检查的指针坐标对象（x, y）
   * @return {FabricObject} **从给定 `objects` 中找到的最上层对象**，包含指针
   * @private
   */
  _searchPossibleTargets(
    objects: FabricObject[],
    pointer: Point,
  ): FabricObject | undefined {
    // 缓存所有边界框包含指针的目标对象
    let i = objects.length; // 从数组末尾开始遍历
    // 不要检查当前分组的对象，因为我们检查的是父组本身
    // 除非我们专门调用此函数来搜索活动组内部
    while (i--) { // 从后向前遍历对象数组
      const target = objects[i]; // 获取当前对象
      if (this._checkTarget(target, pointer)) { // 检查目标对象是否包含指针
        if (isCollection(target) && target.subTargetCheck) { // 如果目标是集合且需要检查子目标
          const subTarget = this._searchPossibleTargets( // 递归查找子目标
            target._objects as FabricObject[],
            pointer,
          );
          subTarget && this.targets.push(subTarget); // 如果找到子目标，将其添加到目标数组中
        }
        return target; // 返回找到的目标对象
      }
    }
  }

  /**
   * 函数用于在对象中搜索包含指针在边界框内的对象，或者在绘制时包含 pointerOnCanvas 的对象
   * @see {@link _searchPossibleTargets}
   * @param {FabricObject[]} [objects] 要查找的对象数组
   * @param {Point} [pointer] 要检查的视口坐标
   * @return {FabricObject} **屏幕上最上面的** 包含指针的对象
   */
  searchPossibleTargets(
    objects: FabricObject[],
    pointer: Point,
  ): FabricObject | undefined {
    const target = this._searchPossibleTargets(objects, pointer); // 调用内部方法查找目标

    // 如果在 this.targets 中找到了目标，并且该组是可交互的，则返回最内层的子目标
    // TODO: 重新验证为什么是可交互的。目标应该始终返回，但仅在可交互时选择。
    if (
      target &&
      isCollection(target) && // 检查目标是否为集合
      target.interactive && // 检查目标是否可交互
      this.targets[0] // 确保 targets 数组中有元素
    ) {
      /** targets[0] 是最内层的嵌套目标，但它可能在非交互组内，因此不是选择目标 */
      const targets = this.targets; // 保存当前目标数组
      for (let i = targets.length - 1; i > 0; i--) { // 从后向前遍历目标数组
        const t = targets[i];
        if (!(isCollection(t) && t.interactive)) { // 如果某个子目标不是交互的
          // 其中一个子目标不是交互的。那就是我们可以返回的最后一个子目标。
          // 我们不能再深入查找；
          return t; // 返回最后一个可交互的子目标
        }
      }
      return targets[0]; // 返回最内层的目标
    }

    return target; // 返回找到的目标
  }

  /**
   * @returns point existing in the same plane as the {@link HTMLCanvasElement},
   * `(0, 0)` being the top left corner of the {@link HTMLCanvasElement}.
   * This means that changes to the {@link viewportTransform} do not change the values of the point
   * and it remains unchanged from the viewer's perspective.
   *
   * @example
   * const scenePoint = sendPointToPlane(
   *  this.getViewportPoint(e),
   *  undefined,
   *  canvas.viewportTransform
   * );
   *
   */
  getViewportPoint(e: TPointerEvent) {
    if (this._pointer) {
      return this._pointer;
    }
    return this.getPointer(e, true);
  }

  /**
   * @returns point existing in the scene (the same plane as the plane {@link FabricObject#getCenterPoint} exists in).
   * This means that changes to the {@link viewportTransform} do not change the values of the point,
   * however, from the viewer's perspective, the point is changed.
   *
   * @example
   * const viewportPoint = sendPointToPlane(
   *  this.getScenePoint(e),
   *  canvas.viewportTransform
   * );
   *
   */
  getScenePoint(e: TPointerEvent) {
    if (this._absolutePointer) {
      return this._absolutePointer;
    }
    return this.getPointer(e);
  }

  /**
   * Returns pointer relative to canvas.
   *
   * @deprecated This method is deprecated since v6 to protect you from misuse.
   * Use {@link getViewportPoint} or {@link getScenePoint} instead.
   *
   * @param {Event} e
   * @param {Boolean} [fromViewport] whether to return the point from the viewport or in the scene
   * @return {Point}
   */
  getPointer(e: TPointerEvent, fromViewport = false): Point {
    const upperCanvasEl = this.upperCanvasEl,
      bounds = upperCanvasEl.getBoundingClientRect();
    let pointer = getPointer(e),
      boundsWidth = bounds.width || 0,
      boundsHeight = bounds.height || 0;

    if (!boundsWidth || !boundsHeight) {
      if (TOP in bounds && BOTTOM in bounds) {
        boundsHeight = Math.abs(bounds.top - bounds.bottom);
      }
      if (RIGHT in bounds && LEFT in bounds) {
        boundsWidth = Math.abs(bounds.right - bounds.left);
      }
    }

    this.calcOffset();
    pointer.x = pointer.x - this._offset.left;
    pointer.y = pointer.y - this._offset.top;
    if (!fromViewport) {
      pointer = sendPointToPlane(pointer, undefined, this.viewportTransform);
    }

    const retinaScaling = this.getRetinaScaling();
    if (retinaScaling !== 1) {
      pointer.x /= retinaScaling;
      pointer.y /= retinaScaling;
    }

    // If bounds are not available (i.e. not visible), do not apply scale.
    const cssScale =
      boundsWidth === 0 || boundsHeight === 0
        ? new Point(1, 1)
        : new Point(
          upperCanvasEl.width / boundsWidth,
          upperCanvasEl.height / boundsHeight,
        );

    return pointer.multiply(cssScale);
  }

  /**
   * Internal use only
   * @protected
   */
  protected _setDimensionsImpl(
    dimensions: TSize,
    options?: TCanvasSizeOptions,
  ) {
    // @ts-expect-error this method exists in the subclass - should be moved or declared as abstract
    this._resetTransformEventData();
    super._setDimensionsImpl(dimensions, options);
    if (this._isCurrentlyDrawing) {
      this.freeDrawingBrush &&
        this.freeDrawingBrush._setBrushStyles(this.contextTop);
    }
  }

  protected _createCacheCanvas() {
    this.pixelFindCanvasEl = createCanvasElement();
    this.pixelFindContext = this.pixelFindCanvasEl.getContext('2d', {
      willReadFrequently: true,
    })!;
    this.setTargetFindTolerance(this.targetFindTolerance);
  }

  /**
   * Returns context of top canvas where interactions are drawn
   * @returns {CanvasRenderingContext2D}
   */
  getTopContext(): CanvasRenderingContext2D {
    return this.elements.upper.ctx;
  }

  /**
   * Returns context of canvas where object selection is drawn
   * @alias
   * @return {CanvasRenderingContext2D}
   */
  getSelectionContext(): CanvasRenderingContext2D {
    return this.elements.upper.ctx;
  }

  /**
   * Returns &lt;canvas> element on which object selection is drawn
   * @return {HTMLCanvasElement}
   */
  getSelectionElement(): HTMLCanvasElement {
    return this.elements.upper.el;
  }

  /**
   * Returns currently active object
   * @return {FabricObject | null} active object
   */
  getActiveObject(): FabricObject | undefined {
    return this._activeObject;
  }

  /**
   * Returns an array with the current selected objects
   * @return {FabricObject[]} active objects array
   */
  getActiveObjects(): FabricObject[] {
    // const active = this._activeObject;
    // return isActiveSelection(active)
    //   ? active.getObjects()
    //   : active
    //     ? [active]
    //     : [];
    return this._activeObjects || [];
  }

  /**
   * @private
   * Compares the old activeObject with the current one and fires correct events
   * @param {FabricObject[]} oldObjects old activeObject
   * @param {TPointerEvent} e mouse event triggering the selection events
   */
  _fireSelectionEvents(oldObjects: FabricObject[], e?: TPointerEvent) {
    let somethingChanged = false,
      invalidate = false;
    const objects = this.getActiveObjects(),
      added: FabricObject[] = [],
      removed: FabricObject[] = [];

    oldObjects.forEach((target) => {
      if (!objects.includes(target)) {
        somethingChanged = true;
        target.fire('deselected', {
          e,
          target,
        });
        removed.push(target);
      }
    });

    objects.forEach((target) => {
      if (!oldObjects.includes(target)) {
        somethingChanged = true;
        target.fire('selected', {
          e,
          target,
        });
        added.push(target);
      }
    });

    if (oldObjects.length > 0 && objects.length > 0) {
      invalidate = true;
      somethingChanged &&
        this.fire('selection:updated', {
          e,
          selected: added,
          deselected: removed,
        });
    } else if (objects.length > 0) {
      invalidate = true;
      this.fire('selection:created', {
        e,
        selected: added,
      });
    } else if (oldObjects.length > 0) {
      invalidate = true;
      this.fire('selection:cleared', {
        e,
        deselected: removed,
      });
    }
    invalidate && (this._objectsToRender = undefined);
  }

  /**
   * Sets given object as the only active object on canvas
   * @param {FabricObject} object Object to set as an active one
   * @param {TPointerEvent} [e] Event (passed along when firing "object:selected")
   * @return {Boolean} true if the object has been selected
   */
  setActiveObject(object: FabricObject, e?: TPointerEvent) {
    // we can't inline this, since _setActiveObject will change what getActiveObjects returns
    const currentActives = this.getActiveObjects();
    const selected = this._setActiveObject(object, e);
    this._fireSelectionEvents(currentActives, e);
    return selected;
  }

  /**
   * This is supposed to be equivalent to setActiveObject but without firing
   * any event. There is commitment to have this stay this way.
   * This is the functional part of setActiveObject.
   * @param {Object} object to set as active
   * @param {Event} [e] Event (passed along when firing "object:selected")
   * @return {Boolean} true if the object has been selected
   */
  _setActiveObject(object: FabricObject, e?: TPointerEvent) {
    const prevActiveObject = this._activeObject;
    if (prevActiveObject === object) {
      return false;
    }
    // after calling this._discardActiveObject, this,_activeObject could be undefined
    if (!this._discardActiveObject(e, object) && this._activeObject) {
      // refused to deselect
      return false;
    }
    if (object.onSelect({ e })) {
      return false;
    }

    this._activeObject = object;

    if (isActiveSelection(object) && prevActiveObject !== object) {
      object.set('canvas', this);
    }
    object.setCoords();

    return true;
  }

  /**
   * This is supposed to be equivalent to discardActiveObject but without firing
   * any selection events ( can still fire object transformation events ). There is commitment to have this stay this way.
   * This is the functional part of discardActiveObject.
   * @param {Event} [e] Event (passed along when firing "object:deselected")
   * @param {Object} object the next object to set as active, reason why we are discarding this
   * @return {Boolean} true if the active object has been discarded
   */
  _discardActiveObject(
    e?: TPointerEvent,
    object?: FabricObject,
  ): this is { _activeObject: undefined } {
    const obj = this._activeObject;
    if (obj) {
      // onDeselect return TRUE to cancel selection;
      if (obj.onDeselect({ e, object })) {
        return false;
      }
      if (this._currentTransform && this._currentTransform.target === obj) {
        this.endCurrentTransform(e);
      }
      if (isActiveSelection(obj) && obj === this._hoveredTarget) {
        this._hoveredTarget = undefined;
      }
      this._activeObject = undefined;
      return true;
    }
    return false;
  }

  /**
   * Discards currently active object and fire events. If the function is called by fabric
   * as a consequence of a mouse event, the event is passed as a parameter and
   * sent to the fire function for the custom events. When used as a method the
   * e param does not have any application.
   * @param {event} e
   * @return {Boolean} true if the active object has been discarded
   */
  discardActiveObject(e?: TPointerEvent): this is { _activeObject: undefined } {
    const currentActives = this.getActiveObjects(),
      activeObject = this.getActiveObject();
    if (currentActives.length) {
      this.fire('before:selection:cleared', {
        e,
        deselected: [activeObject!],
      });
    }
    const discarded = this._discardActiveObject(e);
    this._fireSelectionEvents(currentActives, e);
    return discarded;
  }

  /**
   * End the current transform.
   * You don't usually need to call this method unless you are interrupting a user initiated transform
   * because of some other event ( a press of key combination, or something that block the user UX )
   * @param {Event} [e] send the mouse event that generate the finalize down, so it can be used in the event
   */
  endCurrentTransform(e?: TPointerEvent) {
    const transform = this._currentTransform;
    this._finalizeCurrentTransform(e);
    if (transform && transform.target) {
      // this could probably go inside _finalizeCurrentTransform
      transform.target.isMoving = false;
    }
    this._currentTransform = null;
  }

  /**
   * @private
   * @param {Event} e send the mouse event that generate the finalize down, so it can be used in the event
   */
  _finalizeCurrentTransform(e?: TPointerEvent) {
    const transform = this._currentTransform!,
      target = transform.target,
      options = {
        e,
        target,
        transform,
        action: transform.action,
      };

    if (target._scaling) {
      target._scaling = false;
    }

    target.setCoords();

    if (transform.actionPerformed) {
      this.fire('object:modified', options);
      target.fire(MODIFIED, options);
    }
  }

  /**
   * Sets viewport transformation of this canvas instance
   * @param {Array} vpt a Canvas 2D API transform matrix
   */
  setViewportTransform(vpt: TMat2D) {
    super.setViewportTransform(vpt);
    const activeObject = this._activeObject;
    if (activeObject) {
      activeObject.setCoords();
    }
  }

  /**
   * @override clears active selection ref and interactive canvas elements and contexts
   */
  destroy() {
    // dispose of active selection
    const activeObject = this._activeObject;
    if (isActiveSelection(activeObject)) {
      activeObject.removeAll();
      activeObject.dispose();
    }

    delete this._activeObject;

    super.destroy();

    // free resources

    // pixel find canvas
    // @ts-expect-error disposing
    this.pixelFindContext = null;
    // @ts-expect-error disposing
    this.pixelFindCanvasEl = undefined;
  }

  /**
   * Clears all contexts (background, main, top) of an instance
   */
  clear() {
    // discard active object and fire events
    this.discardActiveObject();
    // make sure we clear the active object in case it refused to be discarded
    this._activeObject = undefined;
    this.clearContext(this.contextTop);
    super.clear();
  }

  cancelActiveObjects(e?: TPointerEvent) {
    if (this._activeObjects && this._activeObjects.length) {
      this._activeObjects.forEach((obj) => {
        this.fire('before:selection:cleared', {
          e,
          deselected: [obj],
        });
      });
      this._activeObjects = [];
    }
  }


  /**
   * 绘制对象的控制元素（边框/控制点）
   * @param {CanvasRenderingContext2D} ctx 要在其上渲染控制元素的上下文
   */
  drawControls(ctx: CanvasRenderingContext2D) {
    // const activeObject = this._activeObject; // 获取当前活动对象

    // if (activeObject) { // 如果存在活动对象
    //   activeObject._renderControls(ctx); // 调用活动对象的渲染控制方法
    // }
    const activeObjects = this._activeObjects;
    if (activeObjects?.length) {
      activeObjects.forEach((obj) => {
        obj._renderControls(ctx);
      });
    }
  }

  /**
   * @private
   */
  protected _toObject(
    instance: FabricObject,
    methodName: 'toObject' | 'toDatalessObject',
    propertiesToInclude: string[],
  ): Record<string, any> {
    // If the object is part of the current selection group, it should
    // be transformed appropriately
    // i.e. it should be serialised as it would appear if the selection group
    // were to be destroyed.
    const originalProperties = this._realizeGroupTransformOnObject(instance),
      object = super._toObject(instance, methodName, propertiesToInclude);
    //Undo the damage we did by changing all of its properties
    instance.set(originalProperties);
    return object;
  }

  /**
   * Realizes an object's group transformation on it
   * @private
   * @param {FabricObject} [instance] the object to transform (gets mutated)
   * @returns the original values of instance which were changed
   */
  private _realizeGroupTransformOnObject(
    instance: FabricObject,
  ): Partial<typeof instance> {
    const { group } = instance;
    if (group && isActiveSelection(group) && this._activeObject === group) {
      const layoutProps = [
        'angle',
        'flipX',
        'flipY',
        LEFT,
        SCALE_X,
        SCALE_Y,
        SKEW_X,
        SKEW_Y,
        TOP,
      ] as (keyof typeof instance)[];
      const originalValues = pick<typeof instance>(instance, layoutProps);
      addTransformToObject(instance, group.calcOwnMatrix());
      return originalValues;
    } else {
      return {};
    }
  }

  /**
   * @private
   */
  _setSVGObject(
    markup: string[],
    instance: FabricObject,
    reviver?: TSVGReviver,
  ) {
    // If the object is in a selection group, simulate what would happen to that
    // object when the group is deselected
    const originalProperties = this._realizeGroupTransformOnObject(instance);
    super._setSVGObject(markup, instance, reviver);
    instance.set(originalProperties);
  }
}
