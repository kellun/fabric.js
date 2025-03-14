import type { TPointerEvent, TPointerEventInfo } from '../../EventTypeDefs';
import type { XY } from '../../Point';
import { Point } from '../../Point';
import { stopEvent } from '../../util/dom_event';
import { invertTransform } from '../../util/misc/matrix';
import { DraggableTextDelegate } from './DraggableTextDelegate';
import type { ITextEvents } from './ITextBehavior';
import { ITextKeyBehavior } from './ITextKeyBehavior';
import type { TOptions } from '../../typedefs';
import type { TextProps, SerializedTextProps } from '../Text/Text';
import type { IText } from './IText';
/**
 * `LEFT_CLICK === 0`
 */
const notALeftClick = (e: Event) => !!(e as MouseEvent).button;

export abstract class ITextClickBehavior<
  Props extends TOptions<TextProps> = Partial<TextProps>,
  SProps extends SerializedTextProps = SerializedTextProps,
  EventSpec extends ITextEvents = ITextEvents,
> extends ITextKeyBehavior<Props, SProps, EventSpec> {
  declare private __lastSelected: boolean;
  declare private __lastClickTime: number;
  declare private __lastLastClickTime: number;
  declare private __lastPointer: XY | Record<string, never>;
  declare private __newClickTime: number;

  protected draggableTextDelegate: DraggableTextDelegate;

  initBehavior() {
    // Initializes event handlers related to cursor or selection
    this.on('mousedown', this._mouseDownHandler);
    this.on('mousedown:before', this._mouseDownHandlerBefore);
    this.on('mouseup', this.mouseUpHandler);
    this.on('mousedblclick', this.doubleClickHandler);
    this.on('tripleclick', this.tripleClickHandler);

    // Initializes "dbclick" event handler
    this.__lastClickTime = +new Date();
    // for triple click
    this.__lastLastClickTime = +new Date();
    this.__lastPointer = {};
    this.on('mousedown', this.onMouseDown);

    this.draggableTextDelegate = new DraggableTextDelegate(
      this as unknown as IText,
    );

    super.initBehavior();
  }

  /**
   * If this method returns true a mouse move operation over a text selection
   * will not prevent the native mouse event allowing the browser to start a drag operation.
   * shouldStartDragging can be read 'do not prevent default for mouse move event'
   * To prevent drag and drop between objects both shouldStartDragging and onDragStart should return false
   * @returns
   */
  shouldStartDragging() {
    return this.draggableTextDelegate.isActive();
  }

  /**
   * @public override this method to control whether instance should/shouldn't become a drag source,
   * @see also {@link DraggableTextDelegate#isActive}
   * To prevent drag and drop between objects both shouldStartDragging and onDragStart should return false
   * @returns {boolean} should handle event
   */
  onDragStart(e: DragEvent) {
    return this.draggableTextDelegate.onDragStart(e);
  }

  /**
   * @public override this method to control whether instance should/shouldn't become a drop target
   */
  canDrop(e: DragEvent) {
    return this.draggableTextDelegate.canDrop(e);
  }

  /**
   * Default event handler to simulate triple click
   * @private
   */
  onMouseDown(options: TPointerEventInfo) {
    if (!this.canvas) {
      return;
    }
    this.__newClickTime = +new Date();
    const newPointer = options.pointer;
    if (this.isTripleClick(newPointer)) {
      this.fire('tripleclick', options);
      stopEvent(options.e);
    }
    this.__lastLastClickTime = this.__lastClickTime;
    this.__lastClickTime = this.__newClickTime;
    this.__lastPointer = newPointer;
    this.__lastSelected = this.selected && !this.getActiveControl();
  }

  isTripleClick(newPointer: XY) {
    return (
      this.__newClickTime - this.__lastClickTime < 500 &&
      this.__lastClickTime - this.__lastLastClickTime < 500 &&
      this.__lastPointer.x === newPointer.x &&
      this.__lastPointer.y === newPointer.y
    );
  }

  /**
   * Default handler for double click, select a word
   */
  doubleClickHandler(options: TPointerEventInfo) {
    if (!this.isEditing) {
      return;
    }
    this.selectWord(this.getSelectionStartFromPointer(options.e));
  }

  /**
   * Default handler for triple click, select a line
   */
  tripleClickHandler(options: TPointerEventInfo) {
    if (!this.isEditing) {
      return;
    }
    this.selectLine(this.getSelectionStartFromPointer(options.e));
  }

  /**
   * 默认的鼠标按下事件处理程序，用于处理文本对象的基本功能
   * 可以被重写以实现不同的行为
   * 该实现的主要功能包括：
   * 1. 查找点击位置
   * 2. 设置 selectionStart 和 selectionEnd
   * 3. 初始化光标或选择区域的绘制
   * 4. 在文本区域初始化鼠标按下事件会取消 fabricjs 对当前组合输入模式（如中文输入法）的跟踪，将其设置为 false
   */
  _mouseDownHandler({ e }: TPointerEventInfo) {
    if (
      !this.canvas ||
      !this.editable ||
      notALeftClick(e) ||
      this.getActiveControl()
    ) {
      return;
    }

    if (this.draggableTextDelegate.start(e)) {
      return;
    }

    this.canvas.textEditingManager.register(this);
    // if (this.selected) {
    //   this.inCompositionMode = false;
    //   this.setCursorByClick(e);
    // }
    this.inCompositionMode = false;
    this.setCursorByClick(e);

    // if (this.isEditing) {
    //   this.__selectionStartOnMouseDown = this.selectionStart;
    //   if (this.selectionStart === this.selectionEnd) {
    //     this.abortCursorAnimation();
    //   }
    //   this.renderCursorOrSelection();
    // }

    this.__selectionStartOnMouseDown = this.selectionStart;
    if (this.selectionStart === this.selectionEnd) {
      this.abortCursorAnimation();
    }
    this.renderCursorOrSelection();
  }

  /**
   * 处理鼠标按下前的事件
   * 主要目的是确保在对象变为不可选择时不会意外触发编辑模式
   * @param {TPointerEventInfo} e 鼠标事件信息
   */
  _mouseDownHandlerBefore({ e }: TPointerEventInfo) {
    // 检查画布是否存在、文本是否可编辑以及是否为左键点击
    if (!this.canvas || !this.editable || notALeftClick(e)) {
      return;
    }
    // 我们想要避免一个对象被选中后变为不可选择时，
    // 可能会以某种方式触发编辑模式。
    // this.selected = this === this.canvas._activeObject;
    this.selected = this.canvas._activeObjects?.includes(this) === true;
  }

  /**
   * 处理鼠标抬起事件的标准处理程序，可被重写
   * @param {TPointerEventInfo} e 鼠标事件信息
   * @private
   */
  mouseUpHandler({ e, transform }: TPointerEventInfo) {
    // 结束拖拽操作并获取是否发生了拖拽
    const didDrag = this.draggableTextDelegate.end(e);
    // 如果存在画布
    if (this.canvas) {
      // 从文本编辑管理器中注销当前对象
      this.canvas.textEditingManager.unregister(this);

      // 获取当前活动对象
      const activeObject = this.canvas._activeObject;
      // 如果存在活动对象且不是当前对象
      if (activeObject && activeObject !== this) {
        // 避免在有活动对象时运行此逻辑
        // 因为在快速点击和shift点击时，可能会快速取消选择和重新选择此对象并触发进入编辑模式
        return;
      }
    }
    // 检查对象是否可编辑、组是否可交互、是否执行了变换操作、是否为左键点击、是否发生了拖拽
    if (
      !this.editable ||
      (this.group && !this.group.interactive) ||
      (transform && transform.actionPerformed) ||
      notALeftClick(e) ||
      didDrag
    ) {
      return;
    }

    // 如果上次点击时对象被选中且没有活动控件
    if (this.__lastSelected && !this.getActiveControl()) {
      // 取消选中状态
      this.selected = false;
      this.__lastSelected = false;
      // 进入编辑模式
      this.enterEditing(e);
      // 如果选择开始和结束位置相同，初始化延迟光标
      if (this.selectionStart === this.selectionEnd) {
        this.initDelayedCursor(true);
      } else {
        // 否则渲染光标或选择区域
        this.renderCursorOrSelection();
      }
    } else {
      // 否则设置对象为选中状态
      this.selected = true;
    }
  }

  /**
   * Changes cursor location in a text depending on passed pointer (x/y) object
   * @param {TPointerEvent} e Event object
   */
  setCursorByClick(e: TPointerEvent) {
    const newSelection = this.getSelectionStartFromPointer(e),
      start = this.selectionStart,
      end = this.selectionEnd;
    if (e.shiftKey) {
      this.setSelectionStartEndWithShift(start, end, newSelection);
    } else {
      this.selectionStart = newSelection;
      this.selectionEnd = newSelection;
    }
    if (this.isEditing) {
      this._fireSelectionChanged();
      this._updateTextarea();
    }
  }

  /**
   * Returns index of a character corresponding to where an object was clicked
   * @param {TPointerEvent} e Event object
   * @return {Number} Index of a character
   */
  getSelectionStartFromPointer(e: TPointerEvent): number {
    const mouseOffset = this.canvas!.getScenePoint(e)
      .transform(invertTransform(this.calcTransformMatrix()))
      .add(new Point(-this._getLeftOffset(), -this._getTopOffset()));
    let height = 0,
      charIndex = 0,
      lineIndex = 0;

    for (let i = 0; i < this._textLines.length; i++) {
      if (height <= mouseOffset.y) {
        height += this.getHeightOfLine(i);
        lineIndex = i;
        if (i > 0) {
          charIndex +=
            this._textLines[i - 1].length + this.missingNewlineOffset(i - 1);
        }
      } else {
        break;
      }
    }
    const lineLeftOffset = Math.abs(this._getLineLeftOffset(lineIndex));
    let width = lineLeftOffset;
    const charLength = this._textLines[lineIndex].length;
    const chars = this.__charBounds[lineIndex];
    for (let j = 0; j < charLength; j++) {
      // i removed something about flipX here, check.
      const charWidth = chars[j].kernedWidth;
      const widthAfter = width + charWidth;
      if (mouseOffset.x <= widthAfter) {
        // if the pointer is closer to the end of the char we increment charIndex
        // in order to position the cursor after the char
        if (
          Math.abs(mouseOffset.x - widthAfter) <=
          Math.abs(mouseOffset.x - width)
        ) {
          charIndex++;
        }
        break;
      }
      width = widthAfter;
      charIndex++;
    }

    return Math.min(
      // if object is horizontally flipped, mirror cursor location from the end
      this.flipX ? charLength - charIndex : charIndex,
      this._text.length,
    );
  }
}
