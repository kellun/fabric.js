import { cache } from '../../cache';
import { DEFAULT_SVG_FONT_SIZE, FILL, STROKE } from '../../constants';
import type { ObjectEvents } from '../../EventTypeDefs';
import type {
  CompleteTextStyleDeclaration,
  TextStyle,
  TextStyleDeclaration,
} from './StyledText';
import { StyledText } from './StyledText';
import { SHARED_ATTRIBUTES } from '../../parser/attributes';
import { parseAttributes } from '../../parser/parseAttributes';
import type {
  Abortable,
  TCacheCanvasDimensions,
  TClassProperties,
  TFiller,
  TOptions,
} from '../../typedefs';
import { classRegistry } from '../../ClassRegistry';
import { graphemeSplit } from '../../util/lang_string';
import { createCanvasElementFor } from '../../util/misc/dom';
import type { TextStyleArray } from '../../util/misc/textStyles';
import {
  hasStyleChanged,
  stylesFromArray,
  stylesToArray,
} from '../../util/misc/textStyles';
import { getPathSegmentsInfo, getPointOnPath } from '../../util/path';
import { cacheProperties } from '../Object/FabricObject';
import type { Path } from '../Path';
import { TextSVGExportMixin } from './TextSVGExportMixin';
import { applyMixins } from '../../util/applyMixins';
import type { FabricObjectProps, SerializedObjectProps } from '../Object/types';
import type { StylePropertiesType } from './constants';
import {
  additionalProps,
  textDefaultValues,
  textLayoutProperties,
  JUSTIFY,
  JUSTIFY_CENTER,
  JUSTIFY_LEFT,
  JUSTIFY_RIGHT,
} from './constants';
import { CENTER, LEFT, RIGHT, TOP, BOTTOM } from '../../constants';
import { isFiller } from '../../util/typeAssertions';
import type { Gradient } from '../../gradient/Gradient';
import type { Pattern } from '../../Pattern';
import type { CSSRules } from '../../parser/typedefs';

let measuringContext: CanvasRenderingContext2D | null;

/**
 * Return a context for measurement of text string.
 * if created it gets stored for reuse
 */
function getMeasuringContext() {
  if (!measuringContext) {
    const canvas = createCanvasElementFor({
      width: 0,
      height: 0,
    });
    measuringContext = canvas.getContext('2d');
  }
  return measuringContext;
}

export type TPathSide = 'left' | 'right';

export type TPathAlign = 'baseline' | 'center' | 'ascender' | 'descender';

export type TextLinesInfo = {
  lines: string[];
  graphemeLines: string[][];
  graphemeText: string[];
  _unwrappedLines: string[][];
};

/**
 * Measure and return the info of a single grapheme.
 * needs the the info of previous graphemes already filled
 * Override to customize measuring
 */
export type GraphemeBBox = {
  width: number;
  height: number;
  kernedWidth: number;
  left: number;
  deltaY: number;
  renderLeft?: number;
  renderTop?: number;
  angle?: number;
};

// @TODO this is not complete
interface UniqueTextProps {
  charSpacing: number;
  lineHeight: number;
  fontSize: number;
  fontWeight: string | number;
  fontFamily: string;
  fontStyle: string;
  pathSide: TPathSide;
  pathAlign: TPathAlign;
  underline: boolean;
  overline: boolean;
  linethrough: boolean;
  textAlign: string;
  direction: CanvasDirection;
  path?: Path;
}

export interface SerializedTextProps
  extends SerializedObjectProps,
    UniqueTextProps {
  styles: TextStyleArray | TextStyle;
}

export interface TextProps extends FabricObjectProps, UniqueTextProps {
  styles: TextStyle;
}

/**
 * Text class
 * @tutorial {@link http://fabricjs.com/fabric-intro-part-2#text}
 */
export class FabricText<
    Props extends TOptions<TextProps> = Partial<TextProps>,
    SProps extends SerializedTextProps = SerializedTextProps,
    EventSpec extends ObjectEvents = ObjectEvents,
  >
  extends StyledText<Props, SProps, EventSpec>
  implements UniqueTextProps
{
  /**
   * Properties that requires a text layout recalculation when changed
   * @type string[]
   * @protected
   */
  static textLayoutProperties: string[] = textLayoutProperties;

  /**
   * @private
   */
  declare _reNewline: RegExp;

  /**
   * Use this regular expression to filter for whitespaces that is not a new line.
   * Mostly used when text is 'justify' aligned.
   * @private
   */
  declare _reSpacesAndTabs: RegExp;

  /**
   * Use this regular expression to filter for whitespace that is not a new line.
   * Mostly used when text is 'justify' aligned.
   * @private
   */
  declare _reSpaceAndTab: RegExp;

  /**
   * Use this regular expression to filter consecutive groups of non spaces.
   * Mostly used when text is 'justify' aligned.
   * @private
   */
  declare _reWords: RegExp;

  declare text: string;

  /**
   * Font size (in pixels)
   * @type Number
   * @default
   */
  declare fontSize: number;

  /**
   * Font weight (e.g. bold, normal, 400, 600, 800)
   * @type {(Number|String)}
   * @default
   */
  declare fontWeight: string | number;

  /**
   * Font family
   * @type String
   * @default
   */
  declare fontFamily: string;

  /**
   * Text decoration underline.
   * @type Boolean
   * @default
   */
  declare underline: boolean;

  /**
   * Text decoration overline.
   * @type Boolean
   * @default
   */
  declare overline: boolean;

  /**
   * Text decoration linethrough.
   * @type Boolean
   * @default
   */
  declare linethrough: boolean;

  /**
   * Text alignment. Possible values: "left", "center", "right", "justify",
   * "justify-left", "justify-center" or "justify-right".
   * @type String
   * @default
   */
  declare textAlign: string;

  /**
   * Font style . Possible values: "", "normal", "italic" or "oblique".
   * @type String
   * @default
   */
  declare fontStyle: string;

  /**
   * Line height
   * @type Number
   * @default
   */
  declare lineHeight: number;

  /**
   * Superscript schema object (minimum overlap)
   */
  declare superscript: {
    /**
     * fontSize factor
     * @default 0.6
     */
    size: number;
    /**
     * baseline-shift factor (upwards)
     * @default -0.35
     */
    baseline: number;
  };

  /**
   * Subscript schema object (minimum overlap)
   */
  declare subscript: {
    /**
     * fontSize factor
     * @default 0.6
     */
    size: number;
    /**
     * baseline-shift factor (downwards)
     * @default 0.11
     */
    baseline: number;
  };

  /**
   * Background color of text lines
   * @type String
   * @default
   */
  declare textBackgroundColor: string;

  declare styles: TextStyle;

  /**
   * Path that the text should follow.
   * since 4.6.0 the path will be drawn automatically.
   * if you want to make the path visible, give it a stroke and strokeWidth or fill value
   * if you want it to be hidden, assign visible = false to the path.
   * This feature is in BETA, and SVG import/export is not yet supported.
   * @type Path
   * @example
   * const textPath = new Text('Text on a path', {
   *     top: 150,
   *     left: 150,
   *     textAlign: 'center',
   *     charSpacing: -50,
   *     path: new Path('M 0 0 C 50 -100 150 -100 200 0', {
   *         strokeWidth: 1,
   *         visible: false
   *     }),
   *     pathSide: 'left',
   *     pathStartOffset: 0
   * });
   * @default
   */
  declare path?: Path;

  /**
   * Offset amount for text path starting position
   * Only used when text has a path
   * @type Number
   * @default
   */
  declare pathStartOffset: number;

  /**
   * Which side of the path the text should be drawn on.
   * Only used when text has a path
   * @type {TPathSide} 'left|right'
   * @default
   */
  declare pathSide: TPathSide;

  /**
   * How text is aligned to the path. This property determines
   * the perpendicular position of each character relative to the path.
   * (one of "baseline", "center", "ascender", "descender")
   * This feature is in BETA, and its behavior may change
   * @type TPathAlign
   * @default
   */
  declare pathAlign: TPathAlign;

  /**
   * @private
   */
  declare _fontSizeFraction: number;

  /**
   * @private
   */
  declare offsets: { underline: number; linethrough: number; overline: number };

  /**
   * Text Line proportion to font Size (in pixels)
   * @type Number
   * @default
   */
  declare _fontSizeMult: number;

  /**
   * additional space between characters
   * expressed in thousands of em unit
   * @type Number
   * @default
   */
  declare charSpacing: number;

  /**
   * Baseline shift, styles only, keep at 0 for the main text object
   * @type {Number}
   * @default
   */
  declare deltaY: number;

  /**
   * WARNING: EXPERIMENTAL. NOT SUPPORTED YET
   * determine the direction of the text.
   * This has to be set manually together with textAlign and originX for proper
   * experience.
   * some interesting link for the future
   * https://www.w3.org/International/questions/qa-bidi-unicode-controls
   * @since 4.5.0
   * @type {CanvasDirection} 'ltr|rtl'
   * @default
   */
  declare direction: CanvasDirection;

  /**
   * contains characters bounding boxes
   * This variable is considered to be protected.
   * But for how mixins are implemented right now, we can't leave it private
   * @protected
   */
  __charBounds: GraphemeBBox[][] = [];

  /**
   * use this size when measuring text. To avoid IE11 rounding errors
   * @type {Number}
   * @default
   * @readonly
   * @private
   */
  declare CACHE_FONT_SIZE: number;

  /**
   * contains the min text width to avoid getting 0
   * @type {Number}
   * @default
   */
  declare MIN_TEXT_WIDTH: number;

  /**
   * contains the the text of the object, divided in lines as they are displayed
   * on screen. Wrapping will divide the text independently of line breaks
   * @type {string[]}
   * @default
   */
  declare textLines: string[];

  /**
   * same as textlines, but each line is an array of graphemes as split by splitByGrapheme
   * @type {string[]}
   * @default
   */
  declare _textLines: string[][];

  declare _unwrappedTextLines: string[][];
  declare _text: string[];
  declare cursorWidth: number;
  declare __lineHeights: number[];
  declare __lineWidths: number[];
  declare initialized?: true;

  static cacheProperties = [...cacheProperties, ...additionalProps];

  static ownDefaults = textDefaultValues;

  static type = 'Text';

  static getDefaults(): Record<string, any> {
    return { ...super.getDefaults(), ...FabricText.ownDefaults };
  }

  constructor(text: string, options?: Props) {
    super();
    Object.assign(this, FabricText.ownDefaults);
    this.setOptions(options);
    if (!this.styles) {
      this.styles = {};
    }
    this.text = text;
    this.initialized = true;
    if (this.path) {
      this.setPathInfo();
    }
    this.initDimensions();
    this.setCoords();
  }

  /**
   * If text has a path, it will add the extra information needed
   * for path and text calculations
   */
  setPathInfo() {
    const path = this.path;
    if (path) {
      path.segmentsInfo = getPathSegmentsInfo(path.path);
    }
  }

  /**
   * @private
   * Divides text into lines of text and lines of graphemes.
   * 将文本分割成文本行和字形行。
   *
   * @returns {TextLinesInfo} 包含分割后的文本行、字形行、字形文本和未换行文本行的信息对象。
   */
  _splitText(): TextLinesInfo {
    // 调用 _splitTextIntoLines 方法将文本分割成不同的行和字形信息
    const newLines = this._splitTextIntoLines(this.text);
    // 将分割后的文本行赋值给 textLines 属性
    this.textLines = newLines.lines;
    // 将分割后的字形行赋值给 _textLines 属性
    this._textLines = newLines.graphemeLines;
    // 将未换行的文本行赋值给 _unwrappedTextLines 属性
    this._unwrappedTextLines = newLines._unwrappedLines;
    // 将分割后的字形文本赋值给 _text 属性
    this._text = newLines.graphemeText;
    // 返回包含分割信息的对象
    return newLines;
  }

  /**
   * 初始化或更新文本的尺寸。
   * 此方法会重新分割文本，清除缓存，标记对象为脏状态，然后根据是否有路径来计算文本的宽度和高度。
   * 如果文本对齐方式为 'justify'，还会调整空格的宽度以实现两端对齐。
   */
  initDimensions() {
    // 分割文本为行和字形
    this._splitText();
    // 清除缓存的行宽、行高和字符边界框信息
    this._clearCache();
    // 标记对象为脏状态，表明需要重新渲染
    this.dirty = true;
    // 如果文本有路径
    if (this.path) {
      // 将路径的宽度赋值给文本对象的宽度
      this.width = this.path.width;
      // 将路径的高度赋值给文本对象的高度
      this.height = this.path.height;
    } else {
      // 计算文本的宽度，取计算结果、光标宽度或最小文本宽度中的最大值
      this.width =
        this.calcTextWidth() || this.cursorWidth || this.MIN_TEXT_WIDTH;
      // 计算文本的高度
      this.height = this.calcTextHeight();
    }
    // 如果文本对齐方式包含 'justify'
    if (this.textAlign.includes(JUSTIFY)) {
      // 注释：一旦文本被测量，我们需要增大空格的宽度以实现两端对齐的文本效果
      this.enlargeSpaces();
    }
  }

  /**
   * Enlarge space boxes and shift the others
   */
  enlargeSpaces() {
    let diffSpace,
      currentLineWidth,
      numberOfSpaces,
      accumulatedSpace,
      line,
      charBound,
      spaces;
    for (let i = 0, len = this._textLines.length; i < len; i++) {
      if (
        this.textAlign !== JUSTIFY &&
        (i === len - 1 || this.isEndOfWrapping(i))
      ) {
        continue;
      }
      accumulatedSpace = 0;
      line = this._textLines[i];
      currentLineWidth = this.getLineWidth(i);
      if (
        currentLineWidth < this.width &&
        (spaces = this.textLines[i].match(this._reSpacesAndTabs))
      ) {
        numberOfSpaces = spaces.length;
        diffSpace = (this.width - currentLineWidth) / numberOfSpaces;
        for (let j = 0; j <= line.length; j++) {
          charBound = this.__charBounds[i][j];
          if (this._reSpaceAndTab.test(line[j])) {
            charBound.width += diffSpace;
            charBound.kernedWidth += diffSpace;
            charBound.left += accumulatedSpace;
            accumulatedSpace += diffSpace;
          } else {
            charBound.left += accumulatedSpace;
          }
        }
      }
    }
  }

  /**
   * Detect if the text line is ended with an hard break
   * text and itext do not have wrapping, return false
   * @return {Boolean}
   */
  isEndOfWrapping(lineIndex: number): boolean {
    return lineIndex === this._textLines.length - 1;
  }

  /**
   * Detect if a line has a linebreak and so we need to account for it when moving
   * and counting style.
   * It return always 1 for text and Itext. Textbox has its own implementation
   * @return Number
   */
  missingNewlineOffset(lineIndex: number, skipWrapping?: boolean): 0 | 1;
  missingNewlineOffset(_lineIndex: number): 1 {
    return 1;
  }

  /**
   * Returns 2d representation (lineIndex and charIndex) of cursor
   * @param {Number} selectionStart
   * @param {Boolean} [skipWrapping] consider the location for unwrapped lines. useful to manage styles.
   */
  get2DCursorLocation(selectionStart: number, skipWrapping?: boolean) {
    const lines = skipWrapping ? this._unwrappedTextLines : this._textLines;
    let i: number;
    for (i = 0; i < lines.length; i++) {
      if (selectionStart <= lines[i].length) {
        return {
          lineIndex: i,
          charIndex: selectionStart,
        };
      }
      selectionStart -=
        lines[i].length + this.missingNewlineOffset(i, skipWrapping);
    }
    return {
      lineIndex: i - 1,
      charIndex:
        lines[i - 1].length < selectionStart
          ? lines[i - 1].length
          : selectionStart,
    };
  }

  /**
   * Returns string representation of an instance
   * @return {String} String representation of text object
   */
  toString(): string {
    return `#<Text (${this.complexity()}): { "text": "${
      this.text
    }", "fontFamily": "${this.fontFamily}" }>`;
  }

  /**
   * Return the dimension and the zoom level needed to create a cache canvas
   * big enough to host the object to be cached.
   * @private
   * @param {Object} dim.x width of object to be cached
   * @param {Object} dim.y height of object to be cached
   * @return {Object}.width width of canvas
   * @return {Object}.height height of canvas
   * @return {Object}.zoomX zoomX zoom value to unscale the canvas before drawing cache
   * @return {Object}.zoomY zoomY zoom value to unscale the canvas before drawing cache
   */
  _getCacheCanvasDimensions(): TCacheCanvasDimensions {
    const dims = super._getCacheCanvasDimensions();
    const fontSize = this.fontSize;
    dims.width += fontSize * dims.zoomX;
    dims.height += fontSize * dims.zoomY;
    return dims;
  }

  /**
   * 在指定的画布上下文中渲染文本对象。
   * 此方法会处理文本路径的渲染、文本样式的设置、文本行背景的渲染、文本装饰（下划线、上划线、删除线）的渲染以及文本内容的渲染。
   *
   * @param {CanvasRenderingContext2D} ctx - 用于渲染的画布上下文。
   */
  _render(ctx: CanvasRenderingContext2D) {
    // 获取文本对象的路径
    const path = this.path;
    // 如果路径存在且可见，则渲染路径
    path && !path.isNotVisible() && path._render(ctx);
    // 设置文本的样式，如字体、字号、对齐方式等
    this._setTextStyles(ctx);
    // 渲染文本行的背景
    this._renderTextLinesBackground(ctx);
    // 渲染文本的下划线装饰
    this._renderTextDecoration(ctx, 'underline');
    // 渲染文本内容，包括填充和描边
    this._renderText(ctx);
    // 渲染文本的上划线装饰
    this._renderTextDecoration(ctx, 'overline');
    // 渲染文本的删除线装饰
    this._renderTextDecoration(ctx, 'linethrough');
  }

  /**
   * @private
   * @param {CanvasRenderingContext2D} ctx Context to render on
   */
  _renderText(ctx: CanvasRenderingContext2D) {
    if (this.paintFirst === STROKE) {
      this._renderTextStroke(ctx);
      this._renderTextFill(ctx);
    } else {
      this._renderTextFill(ctx);
      this._renderTextStroke(ctx);
    }
  }

  /**
   * Set the font parameter of the context with the object properties or with charStyle
   * @private
   * @param {CanvasRenderingContext2D} ctx Context to render on
   * @param {Object} [charStyle] object with font style properties
   * @param {String} [charStyle.fontFamily] Font Family
   * @param {Number} [charStyle.fontSize] Font size in pixels. ( without px suffix )
   * @param {String} [charStyle.fontWeight] Font weight
   * @param {String} [charStyle.fontStyle] Font style (italic|normal)
   */
  _setTextStyles(
    ctx: CanvasRenderingContext2D,
    charStyle?: any,
    forMeasuring?: boolean,
  ) {
    ctx.textBaseline = 'alphabetic';
    if (this.path) {
      switch (this.pathAlign) {
        case CENTER:
          ctx.textBaseline = 'middle';
          break;
        case 'ascender':
          ctx.textBaseline = TOP;
          break;
        case 'descender':
          ctx.textBaseline = BOTTOM;
          break;
      }
    }
    ctx.font = this._getFontDeclaration(charStyle, forMeasuring);
  }

  /**
   * 计算文本的总宽度，即所有行中最宽的行的宽度。
   * 该方法会遍历文本的每一行，调用 `getLineWidth` 方法获取每行的宽度，并找出其中的最大值。
   *
   * @returns {number} - 文本的总宽度。
   */
  calcTextWidth(): number {
    // 初始化最大宽度为第一行的宽度
    let maxWidth = this.getLineWidth(0);

    // 遍历除第一行外的所有行
    for (let i = 1, len = this._textLines.length; i < len; i++) {
      // 获取当前行的宽度
      const currentLineWidth = this.getLineWidth(i);
      // 如果当前行的宽度大于最大宽度，则更新最大宽度
      if (currentLineWidth > maxWidth) {
        maxWidth = currentLineWidth;
      }
    }
    // 返回最大宽度，即文本的总宽度
    return maxWidth;
  }

  /**
   * @private
   * @param {String} method Method name ("fillText" or "strokeText")
   * @param {CanvasRenderingContext2D} ctx Context to render on
   * @param {String} line Text to render
   * @param {Number} left Left position of text
   * @param {Number} top Top position of text
   * @param {Number} lineIndex Index of a line in a text
   */
  _renderTextLine(
    method: 'fillText' | 'strokeText',
    ctx: CanvasRenderingContext2D,
    line: string[],
    left: number,
    top: number,
    lineIndex: number,
  ) {
    this._renderChars(method, ctx, line, left, top, lineIndex);
  }

  /**
   * Renders the text background for lines, taking care of style
   * @private
   * @param {CanvasRenderingContext2D} ctx Context to render on
   */
  _renderTextLinesBackground(ctx: CanvasRenderingContext2D) {
    if (!this.textBackgroundColor && !this.styleHas('textBackgroundColor')) {
      return;
    }
    const originalFill = ctx.fillStyle,
      leftOffset = this._getLeftOffset();
    let lineTopOffset = this._getTopOffset();

    for (let i = 0, len = this._textLines.length; i < len; i++) {
      const heightOfLine = this.getHeightOfLine(i);
      if (
        !this.textBackgroundColor &&
        !this.styleHas('textBackgroundColor', i)
      ) {
        lineTopOffset += heightOfLine;
        continue;
      }
      const jlen = this._textLines[i].length;
      const lineLeftOffset = this._getLineLeftOffset(i);
      let boxWidth = 0;
      let boxStart = 0;
      let drawStart;
      let currentColor;
      let lastColor = this.getValueOfPropertyAt(i, 0, 'textBackgroundColor');
      for (let j = 0; j < jlen; j++) {
        // at this point charbox are either standard or full with pathInfo if there is a path.
        const charBox = this.__charBounds[i][j] as Required<GraphemeBBox>;
        currentColor = this.getValueOfPropertyAt(i, j, 'textBackgroundColor');
        if (this.path) {
          ctx.save();
          ctx.translate(charBox.renderLeft, charBox.renderTop);
          ctx.rotate(charBox.angle);
          ctx.fillStyle = currentColor;
          currentColor &&
            ctx.fillRect(
              -charBox.width / 2,
              (-heightOfLine / this.lineHeight) * (1 - this._fontSizeFraction),
              charBox.width,
              heightOfLine / this.lineHeight,
            );
          ctx.restore();
        } else if (currentColor !== lastColor) {
          drawStart = leftOffset + lineLeftOffset + boxStart;
          if (this.direction === 'rtl') {
            drawStart = this.width - drawStart - boxWidth;
          }
          ctx.fillStyle = lastColor;
          lastColor &&
            ctx.fillRect(
              drawStart,
              lineTopOffset,
              boxWidth,
              heightOfLine / this.lineHeight,
            );
          boxStart = charBox.left;
          boxWidth = charBox.width;
          lastColor = currentColor;
        } else {
          boxWidth += charBox.kernedWidth;
        }
      }
      if (currentColor && !this.path) {
        drawStart = leftOffset + lineLeftOffset + boxStart;
        if (this.direction === 'rtl') {
          drawStart = this.width - drawStart - boxWidth;
        }
        ctx.fillStyle = currentColor;
        ctx.fillRect(
          drawStart,
          lineTopOffset,
          boxWidth,
          heightOfLine / this.lineHeight,
        );
      }
      lineTopOffset += heightOfLine;
    }
    ctx.fillStyle = originalFill;
    // if there is text background color no
    // other shadows should be casted
    this._removeShadow(ctx);
  }

  /**
   * measure and return the width of a single character.
   * possibly overridden to accommodate different measure logic or
   * to hook some external lib for character measurement
   * @private
   * @param {String} _char, char to be measured
   * @param {Object} charStyle style of char to be measured
   * @param {String} [previousChar] previous char
   * @param {Object} [prevCharStyle] style of previous char
   */
  _measureChar(
    _char: string,
    charStyle: CompleteTextStyleDeclaration,
    previousChar: string | undefined,
    prevCharStyle: CompleteTextStyleDeclaration | Record<string, never>,
  ) {
    const fontCache = cache.getFontCache(charStyle),
      fontDeclaration = this._getFontDeclaration(charStyle),
      couple = previousChar + _char,
      stylesAreEqual =
        previousChar &&
        fontDeclaration === this._getFontDeclaration(prevCharStyle),
      fontMultiplier = charStyle.fontSize / this.CACHE_FONT_SIZE;
    let width: number | undefined,
      coupleWidth: number | undefined,
      previousWidth: number | undefined,
      kernedWidth: number | undefined;

    if (previousChar && fontCache[previousChar] !== undefined) {
      previousWidth = fontCache[previousChar];
    }
    if (fontCache[_char] !== undefined) {
      kernedWidth = width = fontCache[_char];
    }
    if (stylesAreEqual && fontCache[couple] !== undefined) {
      coupleWidth = fontCache[couple];
      kernedWidth = coupleWidth - previousWidth!;
    }
    if (
      width === undefined ||
      previousWidth === undefined ||
      coupleWidth === undefined
    ) {
      const ctx = getMeasuringContext()!;
      // send a TRUE to specify measuring font size CACHE_FONT_SIZE
      this._setTextStyles(ctx, charStyle, true);
      if (width === undefined) {
        kernedWidth = width = ctx.measureText(_char).width;
        fontCache[_char] = width;
      }
      if (previousWidth === undefined && stylesAreEqual && previousChar) {
        previousWidth = ctx.measureText(previousChar).width;
        fontCache[previousChar] = previousWidth;
      }
      if (stylesAreEqual && coupleWidth === undefined) {
        // we can measure the kerning couple and subtract the width of the previous character
        coupleWidth = ctx.measureText(couple).width;
        fontCache[couple] = coupleWidth;
        // safe to use the non-null since if undefined we defined it before.
        kernedWidth = coupleWidth - previousWidth!;
      }
    }
    return {
      width: width * fontMultiplier,
      kernedWidth: kernedWidth! * fontMultiplier,
    };
  }

  /**
   * Computes height of character at given position
   * @param {Number} line the line index number
   * @param {Number} _char the character index number
   * @return {Number} fontSize of the character
   */
  getHeightOfChar(line: number, _char: number): number {
    return this.getValueOfPropertyAt(line, _char, 'fontSize');
  }

  /**
   * 测量指定行的宽度。
   * 该方法会调用 `_measureLine` 方法获取行的测量信息，并根据字符间距对宽度进行调整。
   * 如果调整后的宽度小于 0，则将宽度设置为 0。
   *
   * @param {number} lineIndex - 要测量的行的索引。
   * @returns {Object} - 包含测量信息的对象，至少包含 `width` 属性。
   */
  measureLine(lineIndex: number) {
    // 调用 _measureLine 方法获取行的测量信息
    const lineInfo = this._measureLine(lineIndex);
    // 如果字符间距不为 0，则从行宽中减去字符间距的宽度
    if (this.charSpacing !== 0) {
      lineInfo.width -= this._getWidthOfCharSpacing();
    }
    // 如果行宽小于 0，则将行宽设置为 0
    if (lineInfo.width < 0) {
      lineInfo.width = 0;
    }
    // 返回测量信息
    return lineInfo;
  }

  /**
   * 测量指定行的文本宽度和字符信息。
   * 此方法会遍历行中的每个字符，计算其宽度，并根据文本对齐方式和路径信息进行相应的处理。
   *
   * @param {number} lineIndex - 要测量的行的索引。
   * @returns {{ width: number; numOfSpaces: number }} - 包含行的总宽度和空格数量的对象。
   */
  _measureLine(lineIndex: number) {
    // 初始化变量，用于存储行的总宽度、前一个字符和当前字符的信息
    let width = 0,
      prevGrapheme: string | undefined,
      graphemeInfo: GraphemeBBox | undefined;

    // 检查文本是否在路径的右侧，获取路径对象、当前行的字符数组和行的长度
    const reverse = this.pathSide === RIGHT,
      path = this.path,
      line = this._textLines[lineIndex],
      llength = line.length,
      // 创建一个数组来存储当前行每个字符的边界框信息
      lineBounds = new Array<GraphemeBBox>(llength);

    // 将当前行的边界框信息存储到 __charBounds 数组中
    this.__charBounds[lineIndex] = lineBounds;
    // 遍历当前行的每个字符
    for (let i = 0; i < llength; i++) {
      const grapheme = line[i];
      // 获取当前字符的边界框信息
      graphemeInfo = this._getGraphemeBox(grapheme, lineIndex, i, prevGrapheme);
      // 将当前字符的边界框信息存储到 lineBounds 数组中
      lineBounds[i] = graphemeInfo;
      // 累加当前字符的宽度到行的总宽度中
      width += graphemeInfo.kernedWidth;
      // 更新前一个字符为当前字符
      prevGrapheme = grapheme;
    }
    // 为了简化交互式模式下的光标处理，添加一个额外的边界框表示行的最后一个字符
    lineBounds[llength] = {
      left: graphemeInfo ? graphemeInfo.left + graphemeInfo.width : 0,
      width: 0,
      kernedWidth: 0,
      height: this.fontSize,
      deltaY: 0,
    } as GraphemeBBox;
    // 如果文本有路径且路径有分段信息
    if (path && path.segmentsInfo) {
      // 初始化路径上的位置
      let positionInPath = 0;
      // 获取路径的总长度
      const totalPathLength =
        path.segmentsInfo[path.segmentsInfo.length - 1].length;
      // 根据文本对齐方式计算路径上的起始位置
      switch (this.textAlign) {
        case LEFT:
          positionInPath = reverse ? totalPathLength - width : 0;
          break;
        case CENTER:
          positionInPath = (totalPathLength - width) / 2;
          break;
        case RIGHT:
          positionInPath = reverse ? 0 : totalPathLength - width;
          break;
        //todo - add support for justify
      }
      // 根据路径起始偏移量和方向调整路径上的位置
      positionInPath += this.pathStartOffset * (reverse ? -1 : 1);
      // 根据文本是否在路径右侧决定遍历方向
      for (
        let i = reverse ? llength - 1 : 0;
        reverse ? i >= 0 : i < llength;
        reverse ? i-- : i++
      ) {
        // 获取当前字符的边界框信息
        graphemeInfo = lineBounds[i];
        // 处理路径位置超出或小于路径总长度的情况
        if (positionInPath > totalPathLength) {
          positionInPath %= totalPathLength;
        } else if (positionInPath < 0) {
          positionInPath += totalPathLength;
        }
        // 为当前字符设置路径上的位置和角度信息
        this._setGraphemeOnPath(positionInPath, graphemeInfo);
        // 更新路径上的位置
        positionInPath += graphemeInfo.kernedWidth;
      }
    }
    // 返回行的总宽度和空格数量
    return { width: width, numOfSpaces: 0 };
  }

  /**
   * Calculate the angle  and the left,top position of the char that follow a path.
   * It appends it to graphemeInfo to be reused later at rendering
   * @private
   * @param {Number} positionInPath to be measured
   * @param {GraphemeBBox} graphemeInfo current grapheme box information
   * @param {Object} startingPoint position of the point
   */
  _setGraphemeOnPath(positionInPath: number, graphemeInfo: GraphemeBBox) {
    const centerPosition = positionInPath + graphemeInfo.kernedWidth / 2,
      path = this.path!;

    // we are at currentPositionOnPath. we want to know what point on the path is.
    const info = getPointOnPath(path.path, centerPosition, path.segmentsInfo)!;
    graphemeInfo.renderLeft = info.x - path.pathOffset.x;
    graphemeInfo.renderTop = info.y - path.pathOffset.y;
    graphemeInfo.angle = info.angle + (this.pathSide === RIGHT ? Math.PI : 0);
  }

  /**
   *
   * @param {String} grapheme to be measured
   * @param {Number} lineIndex index of the line where the char is
   * @param {Number} charIndex position in the line
   * @param {String} [prevGrapheme] character preceding the one to be measured
   * @returns {GraphemeBBox} grapheme bbox
   */
  _getGraphemeBox(
    grapheme: string,
    lineIndex: number,
    charIndex: number,
    prevGrapheme?: string,
    skipLeft?: boolean,
  ): GraphemeBBox {
    const style = this.getCompleteStyleDeclaration(lineIndex, charIndex),
      prevStyle = prevGrapheme
        ? this.getCompleteStyleDeclaration(lineIndex, charIndex - 1)
        : {},
      info = this._measureChar(grapheme, style, prevGrapheme, prevStyle);
    let kernedWidth = info.kernedWidth,
      width = info.width,
      charSpacing;

    if (this.charSpacing !== 0) {
      charSpacing = this._getWidthOfCharSpacing();
      width += charSpacing;
      kernedWidth += charSpacing;
    }

    const box: GraphemeBBox = {
      width,
      left: 0,
      height: style.fontSize,
      kernedWidth,
      deltaY: style.deltaY,
    };
    if (charIndex > 0 && !skipLeft) {
      const previousBox = this.__charBounds[lineIndex][charIndex - 1];
      box.left =
        previousBox.left + previousBox.width + info.kernedWidth - info.width;
    }
    return box;
  }

  /**
   * Calculate height of line at 'lineIndex'
   * @param {Number} lineIndex index of line to calculate
   * @return {Number}
   */
  getHeightOfLine(lineIndex: number): number {
    if (this.__lineHeights[lineIndex]) {
      return this.__lineHeights[lineIndex];
    }

    // char 0 is measured before the line cycle because it needs to char
    // emptylines
    let maxHeight = this.getHeightOfChar(lineIndex, 0);
    for (let i = 1, len = this._textLines[lineIndex].length; i < len; i++) {
      maxHeight = Math.max(this.getHeightOfChar(lineIndex, i), maxHeight);
    }

    return (this.__lineHeights[lineIndex] =
      maxHeight * this.lineHeight * this._fontSizeMult);
  }

  /**
   * Calculate text box height
   */
  calcTextHeight() {
    let lineHeight,
      height = 0;
    for (let i = 0, len = this._textLines.length; i < len; i++) {
      lineHeight = this.getHeightOfLine(i);
      height += i === len - 1 ? lineHeight / this.lineHeight : lineHeight;
    }
    return height;
  }

  /**
   * @private
   * @return {Number} Left offset
   */
  _getLeftOffset(): number {
    return this.direction === 'ltr' ? -this.width / 2 : this.width / 2;
  }

  /**
   * @private
   * @return {Number} Top offset
   */
  _getTopOffset(): number {
    return -this.height / 2;
  }

  /**
   * @private
   * @param {CanvasRenderingContext2D} ctx Context to render on
   * @param {String} method Method name ("fillText" or "strokeText")
   */
  _renderTextCommon(
    ctx: CanvasRenderingContext2D,
    method: 'fillText' | 'strokeText',
  ) {
    ctx.save();
    let lineHeights = 0;
    const left = this._getLeftOffset(),
      top = this._getTopOffset();
    for (let i = 0, len = this._textLines.length; i < len; i++) {
      const heightOfLine = this.getHeightOfLine(i),
        maxHeight = heightOfLine / this.lineHeight,
        leftOffset = this._getLineLeftOffset(i);
      this._renderTextLine(
        method,
        ctx,
        this._textLines[i],
        left + leftOffset,
        top + lineHeights + maxHeight,
        i,
      );
      lineHeights += heightOfLine;
    }
    ctx.restore();
  }

  /**
   * @private
   * @param {CanvasRenderingContext2D} ctx Context to render on
   */
  _renderTextFill(ctx: CanvasRenderingContext2D) {
    if (!this.fill && !this.styleHas(FILL)) {
      return;
    }

    this._renderTextCommon(ctx, 'fillText');
  }

  /**
   * @private
   * @param {CanvasRenderingContext2D} ctx Context to render on
   */
  _renderTextStroke(ctx: CanvasRenderingContext2D) {
    if ((!this.stroke || this.strokeWidth === 0) && this.isEmptyStyles()) {
      return;
    }

    if (this.shadow && !this.shadow.affectStroke) {
      this._removeShadow(ctx);
    }

    ctx.save();
    this._setLineDash(ctx, this.strokeDashArray);
    ctx.beginPath();
    this._renderTextCommon(ctx, 'strokeText');
    ctx.closePath();
    ctx.restore();
  }

  /**
   * @private
   * @param {String} method fillText or strokeText.
   * @param {CanvasRenderingContext2D} ctx Context to render on
   * @param {Array} line Content of the line, splitted in an array by grapheme
   * @param {Number} left
   * @param {Number} top
   * @param {Number} lineIndex
   */
  _renderChars(
    method: 'fillText' | 'strokeText',
    ctx: CanvasRenderingContext2D,
    line: Array<any>,
    left: number,
    top: number,
    lineIndex: number,
  ) {
    const lineHeight = this.getHeightOfLine(lineIndex),
      isJustify = this.textAlign.includes(JUSTIFY),
      path = this.path,
      shortCut =
        !isJustify &&
        this.charSpacing === 0 &&
        this.isEmptyStyles(lineIndex) &&
        !path,
      isLtr = this.direction === 'ltr',
      sign = this.direction === 'ltr' ? 1 : -1,
      // this was changed in the PR #7674
      // currentDirection = ctx.canvas.getAttribute('dir');
      currentDirection = ctx.direction;

    let actualStyle,
      nextStyle,
      charsToRender = '',
      charBox,
      boxWidth = 0,
      timeToRender,
      drawingLeft;

    ctx.save();
    if (currentDirection !== this.direction) {
      ctx.canvas.setAttribute('dir', isLtr ? 'ltr' : 'rtl');
      ctx.direction = isLtr ? 'ltr' : 'rtl';
      ctx.textAlign = isLtr ? LEFT : RIGHT;
    }
    top -= (lineHeight * this._fontSizeFraction) / this.lineHeight;
    if (shortCut) {
      // render all the line in one pass without checking
      // drawingLeft = isLtr ? left : left - this.getLineWidth(lineIndex);
      this._renderChar(method, ctx, lineIndex, 0, line.join(''), left, top);
      ctx.restore();
      return;
    }
    for (let i = 0, len = line.length - 1; i <= len; i++) {
      timeToRender = i === len || this.charSpacing || path;
      charsToRender += line[i];
      charBox = this.__charBounds[lineIndex][i] as Required<GraphemeBBox>;
      if (boxWidth === 0) {
        left += sign * (charBox.kernedWidth - charBox.width);
        boxWidth += charBox.width;
      } else {
        boxWidth += charBox.kernedWidth;
      }
      if (isJustify && !timeToRender) {
        if (this._reSpaceAndTab.test(line[i])) {
          timeToRender = true;
        }
      }
      if (!timeToRender) {
        // if we have charSpacing, we render char by char
        actualStyle =
          actualStyle || this.getCompleteStyleDeclaration(lineIndex, i);
        nextStyle = this.getCompleteStyleDeclaration(lineIndex, i + 1);
        timeToRender = hasStyleChanged(actualStyle, nextStyle, false);
      }
      if (timeToRender) {
        if (path) {
          ctx.save();
          ctx.translate(charBox.renderLeft, charBox.renderTop);
          ctx.rotate(charBox.angle);
          this._renderChar(
            method,
            ctx,
            lineIndex,
            i,
            charsToRender,
            -boxWidth / 2,
            0,
          );
          ctx.restore();
        } else {
          drawingLeft = left;
          this._renderChar(
            method,
            ctx,
            lineIndex,
            i,
            charsToRender,
            drawingLeft,
            top,
          );
        }
        charsToRender = '';
        actualStyle = nextStyle;
        left += sign * boxWidth;
        boxWidth = 0;
      }
    }
    ctx.restore();
  }

  /**
   * This function try to patch the missing gradientTransform on canvas gradients.
   * transforming a context to transform the gradient, is going to transform the stroke too.
   * we want to transform the gradient but not the stroke operation, so we create
   * a transformed gradient on a pattern and then we use the pattern instead of the gradient.
   * this method has drawbacks: is slow, is in low resolution, needs a patch for when the size
   * is limited.
   * @private
   * @param {TFiller} filler a fabric gradient instance
   * @return {CanvasPattern} a pattern to use as fill/stroke style
   */
  _applyPatternGradientTransformText(filler: TFiller) {
    // TODO: verify compatibility with strokeUniform
    const width = this.width + this.strokeWidth,
      height = this.height + this.strokeWidth,
      pCanvas = createCanvasElementFor({
        width,
        height,
      }),
      pCtx = pCanvas.getContext('2d')!;
    pCanvas.width = width;
    pCanvas.height = height;
    pCtx.beginPath();
    pCtx.moveTo(0, 0);
    pCtx.lineTo(width, 0);
    pCtx.lineTo(width, height);
    pCtx.lineTo(0, height);
    pCtx.closePath();
    pCtx.translate(width / 2, height / 2);
    pCtx.fillStyle = filler.toLive(pCtx)!;
    this._applyPatternGradientTransform(pCtx, filler);
    pCtx.fill();
    return pCtx.createPattern(pCanvas, 'no-repeat')!;
  }

  handleFiller<T extends 'fill' | 'stroke'>(
    ctx: CanvasRenderingContext2D,
    property: `${T}Style`,
    filler: TFiller | string,
  ): { offsetX: number; offsetY: number } {
    let offsetX: number, offsetY: number;
    if (isFiller(filler)) {
      if (
        (filler as Gradient<'linear'>).gradientUnits === 'percentage' ||
        (filler as Gradient<'linear'>).gradientTransform ||
        (filler as Pattern).patternTransform
      ) {
        // need to transform gradient in a pattern.
        // this is a slow process. If you are hitting this codepath, and the object
        // is not using caching, you should consider switching it on.
        // we need a canvas as big as the current object caching canvas.
        offsetX = -this.width / 2;
        offsetY = -this.height / 2;
        ctx.translate(offsetX, offsetY);
        ctx[property] = this._applyPatternGradientTransformText(filler);
        return { offsetX, offsetY };
      } else {
        // is a simple gradient or pattern
        ctx[property] = filler.toLive(ctx)!;
        return this._applyPatternGradientTransform(ctx, filler);
      }
    } else {
      // is a color
      ctx[property] = filler;
    }
    return { offsetX: 0, offsetY: 0 };
  }

  /**
   * This function prepare the canvas for a stroke style, and stroke and strokeWidth
   * need to be sent in as defined
   * @param {CanvasRenderingContext2D} ctx
   * @param {CompleteTextStyleDeclaration} style with stroke and strokeWidth defined
   * @returns
   */
  _setStrokeStyles(
    ctx: CanvasRenderingContext2D,
    {
      stroke,
      strokeWidth,
    }: Pick<CompleteTextStyleDeclaration, 'stroke' | 'strokeWidth'>,
  ) {
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = this.strokeLineCap;
    ctx.lineDashOffset = this.strokeDashOffset;
    ctx.lineJoin = this.strokeLineJoin;
    ctx.miterLimit = this.strokeMiterLimit;
    return this.handleFiller(ctx, 'strokeStyle', stroke!);
  }

  /**
   * This function prepare the canvas for a ill style, and fill
   * need to be sent in as defined
   * @param {CanvasRenderingContext2D} ctx
   * @param {CompleteTextStyleDeclaration} style with ill defined
   * @returns
   */
  _setFillStyles(ctx: CanvasRenderingContext2D, { fill }: Pick<this, 'fill'>) {
    return this.handleFiller(ctx, 'fillStyle', fill!);
  }

  /**
   * @private
   * @param {String} method
   * @param {CanvasRenderingContext2D} ctx Context to render on
   * @param {Number} lineIndex
   * @param {Number} charIndex
   * @param {String} _char
   * @param {Number} left Left coordinate
   * @param {Number} top Top coordinate
   * @param {Number} lineHeight Height of the line
   */
  _renderChar(
    method: 'fillText' | 'strokeText',
    ctx: CanvasRenderingContext2D,
    lineIndex: number,
    charIndex: number,
    _char: string,
    left: number,
    top: number,
  ) {
    const decl = this._getStyleDeclaration(lineIndex, charIndex),
      fullDecl = this.getCompleteStyleDeclaration(lineIndex, charIndex),
      shouldFill = method === 'fillText' && fullDecl.fill,
      shouldStroke =
        method === 'strokeText' && fullDecl.stroke && fullDecl.strokeWidth;

    if (!shouldStroke && !shouldFill) {
      return;
    }
    ctx.save();

    ctx.font = this._getFontDeclaration(fullDecl);

    if (decl.textBackgroundColor) {
      this._removeShadow(ctx);
    }
    if (decl.deltaY) {
      top += decl.deltaY;
    }

    if (shouldFill) {
      const fillOffsets = this._setFillStyles(ctx, fullDecl);
      ctx.fillText(
        _char,
        left - fillOffsets.offsetX,
        top - fillOffsets.offsetY,
      );
    }

    if (shouldStroke) {
      const strokeOffsets = this._setStrokeStyles(ctx, fullDecl);
      ctx.strokeText(
        _char,
        left - strokeOffsets.offsetX,
        top - strokeOffsets.offsetY,
      );
    }

    ctx.restore();
  }

  /**
   * Turns the character into a 'superior figure' (i.e. 'superscript')
   * @param {Number} start selection start
   * @param {Number} end selection end
   */
  setSuperscript(start: number, end: number) {
    this._setScript(start, end, this.superscript);
  }

  /**
   * Turns the character into an 'inferior figure' (i.e. 'subscript')
   * @param {Number} start selection start
   * @param {Number} end selection end
   */
  setSubscript(start: number, end: number) {
    this._setScript(start, end, this.subscript);
  }

  /**
   * Applies 'schema' at given position
   * @private
   * @param {Number} start selection start
   * @param {Number} end selection end
   * @param {Number} schema
   */
  protected _setScript(
    start: number,
    end: number,
    schema: {
      size: number;
      baseline: number;
    },
  ) {
    const loc = this.get2DCursorLocation(start, true),
      fontSize = this.getValueOfPropertyAt(
        loc.lineIndex,
        loc.charIndex,
        'fontSize',
      ),
      dy = this.getValueOfPropertyAt(loc.lineIndex, loc.charIndex, 'deltaY'),
      style = {
        fontSize: fontSize * schema.size,
        deltaY: dy + fontSize * schema.baseline,
      };
    this.setSelectionStyles(style, start, end);
  }

  /**
   * @private
   * @param {Number} lineIndex index text line
   * @return {Number} Line left offset
   */
  _getLineLeftOffset(lineIndex: number): number {
    const lineWidth = this.getLineWidth(lineIndex),
      lineDiff = this.width - lineWidth,
      textAlign = this.textAlign,
      direction = this.direction,
      isEndOfWrapping = this.isEndOfWrapping(lineIndex);
    let leftOffset = 0;
    if (
      textAlign === JUSTIFY ||
      (textAlign === JUSTIFY_CENTER && !isEndOfWrapping) ||
      (textAlign === JUSTIFY_RIGHT && !isEndOfWrapping) ||
      (textAlign === JUSTIFY_LEFT && !isEndOfWrapping)
    ) {
      return 0;
    }
    if (textAlign === CENTER) {
      leftOffset = lineDiff / 2;
    }
    if (textAlign === RIGHT) {
      leftOffset = lineDiff;
    }
    if (textAlign === JUSTIFY_CENTER) {
      leftOffset = lineDiff / 2;
    }
    if (textAlign === JUSTIFY_RIGHT) {
      leftOffset = lineDiff;
    }
    if (direction === 'rtl') {
      if (
        textAlign === RIGHT ||
        textAlign === JUSTIFY ||
        textAlign === JUSTIFY_RIGHT
      ) {
        leftOffset = 0;
      } else if (textAlign === LEFT || textAlign === JUSTIFY_LEFT) {
        leftOffset = -lineDiff;
      } else if (textAlign === CENTER || textAlign === JUSTIFY_CENTER) {
        leftOffset = -lineDiff / 2;
      }
    }
    return leftOffset;
  }

  /**
   * @private
   */
  _clearCache() {
    this._forceClearCache = false;
    this.__lineWidths = [];
    this.__lineHeights = [];
    this.__charBounds = [];
  }

  /**
   * 获取指定行的宽度。
   * 如果该行的宽度已经被计算过并缓存，直接返回缓存的值；
   * 否则，调用 `measureLine` 方法计算该行的宽度，并将结果缓存起来。
   *
   * @param {number} lineIndex - 要获取宽度的行的索引。
   * @returns {number} - 指定行的宽度。
   */
  getLineWidth(lineIndex: number): number {
    // 检查该行的宽度是否已经被计算过并缓存
    if (this.__lineWidths[lineIndex] !== undefined) {
      // 如果已经缓存，直接返回缓存的值
      return this.__lineWidths[lineIndex];
    }

    // 如果未缓存，调用 measureLine 方法计算该行的宽度
    const { width } = this.measureLine(lineIndex);
    // 将计算得到的宽度缓存起来
    this.__lineWidths[lineIndex] = width;
    // 返回计算得到的宽度
    return width;
  }

  _getWidthOfCharSpacing() {
    if (this.charSpacing !== 0) {
      return (this.fontSize * this.charSpacing) / 1000;
    }
    return 0;
  }

  /**
   * Retrieves the value of property at given character position
   * @param {Number} lineIndex the line number
   * @param {Number} charIndex the character number
   * @param {String} property the property name
   * @returns the value of 'property'
   */
  getValueOfPropertyAt<T extends StylePropertiesType>(
    lineIndex: number,
    charIndex: number,
    property: T,
  ): this[T] {
    const charStyle = this._getStyleDeclaration(lineIndex, charIndex);
    return (charStyle[property] ?? this[property]) as this[T];
  }

  /**
   * @private
   * @param {CanvasRenderingContext2D} ctx Context to render on
   */
  _renderTextDecoration(
    ctx: CanvasRenderingContext2D,
    type: 'underline' | 'linethrough' | 'overline',
  ) {
    if (!this[type] && !this.styleHas(type)) {
      return;
    }
    let topOffset = this._getTopOffset();
    const leftOffset = this._getLeftOffset(),
      path = this.path,
      charSpacing = this._getWidthOfCharSpacing(),
      offsetY = this.offsets[type];

    for (let i = 0, len = this._textLines.length; i < len; i++) {
      const heightOfLine = this.getHeightOfLine(i);
      if (!this[type] && !this.styleHas(type, i)) {
        topOffset += heightOfLine;
        continue;
      }
      const line = this._textLines[i];
      const maxHeight = heightOfLine / this.lineHeight;
      const lineLeftOffset = this._getLineLeftOffset(i);
      let boxStart = 0;
      let boxWidth = 0;
      let lastDecoration = this.getValueOfPropertyAt(i, 0, type);
      let lastFill = this.getValueOfPropertyAt(i, 0, FILL);
      let currentDecoration;
      let currentFill;
      const top = topOffset + maxHeight * (1 - this._fontSizeFraction);
      let size = this.getHeightOfChar(i, 0);
      let dy = this.getValueOfPropertyAt(i, 0, 'deltaY');
      for (let j = 0, jlen = line.length; j < jlen; j++) {
        const charBox = this.__charBounds[i][j] as Required<GraphemeBBox>;
        currentDecoration = this.getValueOfPropertyAt(i, j, type);
        currentFill = this.getValueOfPropertyAt(i, j, FILL);
        const currentSize = this.getHeightOfChar(i, j);
        const currentDy = this.getValueOfPropertyAt(i, j, 'deltaY');
        if (path && currentDecoration && currentFill) {
          ctx.save();
          // bug? verify lastFill is a valid fill here.
          ctx.fillStyle = lastFill as string;
          ctx.translate(charBox.renderLeft, charBox.renderTop);
          ctx.rotate(charBox.angle);
          ctx.fillRect(
            -charBox.kernedWidth / 2,
            offsetY * currentSize + currentDy,
            charBox.kernedWidth,
            this.fontSize / 15,
          );
          ctx.restore();
        } else if (
          (currentDecoration !== lastDecoration ||
            currentFill !== lastFill ||
            currentSize !== size ||
            currentDy !== dy) &&
          boxWidth > 0
        ) {
          let drawStart = leftOffset + lineLeftOffset + boxStart;
          if (this.direction === 'rtl') {
            drawStart = this.width - drawStart - boxWidth;
          }
          if (lastDecoration && lastFill) {
            // bug? verify lastFill is a valid fill here.
            ctx.fillStyle = lastFill as string;
            ctx.fillRect(
              drawStart,
              top + offsetY * size + dy,
              boxWidth,
              this.fontSize / 15,
            );
          }
          boxStart = charBox.left;
          boxWidth = charBox.width;
          lastDecoration = currentDecoration;
          lastFill = currentFill;
          size = currentSize;
          dy = currentDy;
        } else {
          boxWidth += charBox.kernedWidth;
        }
      }
      let drawStart = leftOffset + lineLeftOffset + boxStart;
      if (this.direction === 'rtl') {
        drawStart = this.width - drawStart - boxWidth;
      }
      ctx.fillStyle = currentFill as string;
      currentDecoration &&
        currentFill &&
        ctx.fillRect(
          drawStart,
          top + offsetY * size + dy,
          boxWidth - charSpacing,
          this.fontSize / 15,
        );
      topOffset += heightOfLine;
    }
    // if there is text background color no
    // other shadows should be casted
    this._removeShadow(ctx);
  }

  /**
   * return font declaration string for canvas context
   * @param {Object} [styleObject] object
   * @returns {String} font declaration formatted for canvas context.
   */
  _getFontDeclaration(
    {
      fontFamily = this.fontFamily,
      fontStyle = this.fontStyle,
      fontWeight = this.fontWeight,
      fontSize = this.fontSize,
    }: Partial<
      Pick<
        TextStyleDeclaration,
        'fontFamily' | 'fontStyle' | 'fontWeight' | 'fontSize'
      >
    > = {},
    forMeasuring?: boolean,
  ): string {
    const parsedFontFamily =
      fontFamily.includes("'") ||
      fontFamily.includes('"') ||
      fontFamily.includes(',') ||
      FabricText.genericFonts.includes(fontFamily.toLowerCase())
        ? fontFamily
        : `"${fontFamily}"`;
    return [
      fontStyle,
      fontWeight,
      `${forMeasuring ? this.CACHE_FONT_SIZE : fontSize}px`,
      parsedFontFamily,
    ].join(' ');
  }

  /**
   * 在指定的画布上下文中渲染文本对象。
   * 此方法会先检查文本对象的可见性、是否在屏幕内以及是否需要强制清除缓存，
   * 然后调用父类的 render 方法进行渲染。
   *
   * @param {CanvasRenderingContext2D} ctx - 用于渲染的画布上下文。
   */
  render(ctx: CanvasRenderingContext2D) {
    // 检查文本对象是否可见，如果不可见则直接返回，不进行渲染
    if (!this.visible) {
      return;
    }
    // 检查画布是否设置了跳过屏幕外对象的渲染，并且文本对象不在组内且不在屏幕内，
    // 如果满足条件则直接返回，不进行渲染
    if (
      this.canvas &&
      this.canvas.skipOffscreen &&
      !this.group &&
      !this.isOnScreen()
    ) {
      return;
    }
    // 检查是否需要强制清除缓存，如果需要则重新初始化文本对象的尺寸
    if (this._forceClearCache) {
      this.initDimensions();
    }
    // 调用父类的 render 方法进行渲染
    super.render(ctx);
  }

  /**
   * Override this method to customize grapheme splitting
   * 重写此方法以自定义字形分割逻辑
   * @todo the util `graphemeSplit` needs to be injectable in some way.
   * 待办事项：工具函数 `graphemeSplit` 需要以某种方式可注入。
   * is more comfortable to inject the correct util rather than having to override text
   * 比起在原型链中间重写文本处理逻辑，注入正确的工具函数会更方便。
   * @param {string} value 要进行字形分割的字符串
   * @returns {string[]} array of graphemes 分割后的字形数组
   */
  graphemeSplit(value: string): string[] {
    // 调用外部的 graphemeSplit 函数对传入的字符串进行字形分割
    return graphemeSplit(value);
  }

  /**
   * Returns the text as an array of lines.
   * 将文本分割成文本行和字形行的信息对象。
   *
   * @param {String} text text to split 需要分割的文本
   * @returns  Lines in the text 返回包含分割后的文本行、字形行、字形文本和未换行文本行的信息对象
   */
  _splitTextIntoLines(text: string): TextLinesInfo {
    // 使用正则表达式 _reNewline 分割文本为行
    const lines = text.split(this._reNewline),
      // 创建一个新数组 newLines，用于存储每行的字形数组
      newLines = new Array<string[]>(lines.length),
      // 定义一个换行符数组
      newLine = ['\n'];
    // 初始化一个空数组，用于存储所有字形组成的文本
    let newText: string[] = [];
    // 遍历分割后的每一行
    for (let i = 0; i < lines.length; i++) {
      // 将当前行的文本分割成字形数组，并存储到 newLines 中
      newLines[i] = this.graphemeSplit(lines[i]);
      // 将当前行的字形数组和换行符数组添加到 newText 中
      newText = newText.concat(newLines[i], newLine);
    }
    // 移除 newText 末尾的换行符
    newText.pop();
    // 返回包含分割信息的对象
    return {
      // 未换行的文本行，存储每行的字形数组
      _unwrappedLines: newLines,
      // 分割后的文本行
      lines: lines,
      // 所有字形组成的文本
      graphemeText: newText,
      // 每行的字形数组
      graphemeLines: newLines,
    };
  }

  /**
   * Returns object representation of an instance
   * @param {Array} [propertiesToInclude] Any properties that you might want to additionally include in the output
   * @return {Object} Object representation of an instance
   */
  toObject<
    T extends Omit<Props & TClassProperties<this>, keyof SProps>,
    K extends keyof T = never,
  >(propertiesToInclude: K[] = []): Pick<T, K> & SProps {
    return {
      ...super.toObject([...additionalProps, ...propertiesToInclude] as K[]),
      styles: stylesToArray(this.styles, this.text),
      ...(this.path ? { path: this.path.toObject() } : {}),
    };
  }

  set(key: string | any, value?: any) {
    const { textLayoutProperties } = this.constructor as typeof FabricText;
    super.set(key, value);
    let needsDims = false;
    let isAddingPath = false;
    if (typeof key === 'object') {
      for (const _key in key) {
        if (_key === 'path') {
          this.setPathInfo();
        }
        needsDims = needsDims || textLayoutProperties.includes(_key);
        isAddingPath = isAddingPath || _key === 'path';
      }
    } else {
      needsDims = textLayoutProperties.includes(key);
      isAddingPath = key === 'path';
    }
    if (isAddingPath) {
      this.setPathInfo();
    }
    if (needsDims && this.initialized) {
      this.initDimensions();
      this.setCoords();
    }
    return this;
  }

  /**
   * Returns complexity of an instance
   * @return {Number} complexity
   */
  complexity(): number {
    return 1;
  }

  /**
   * List of generic font families
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/font-family#generic-name
   */
  static genericFonts = [
    'serif',
    'sans-serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'ui-serif',
    'ui-sans-serif',
    'ui-monospace',
    'ui-rounded',
    'math',
    'emoji',
    'fangsong',
  ];

  /* _FROM_SVG_START_ */

  /**
   * List of attribute names to account for when parsing SVG element (used by {@link FabricText.fromElement})
   * @static
   * @memberOf Text
   * @see: http://www.w3.org/TR/SVG/text.html#TextElement
   */
  static ATTRIBUTE_NAMES = SHARED_ATTRIBUTES.concat(
    'x',
    'y',
    'dx',
    'dy',
    'font-family',
    'font-style',
    'font-weight',
    'font-size',
    'letter-spacing',
    'text-decoration',
    'text-anchor',
  );

  /**
   * Returns FabricText instance from an SVG element (<b>not yet implemented</b>)
   * @static
   * @memberOf Text
   * @param {HTMLElement} element Element to parse
   * @param {Object} [options] Options object
   */
  static async fromElement(
    element: HTMLElement,
    options: Abortable,
    cssRules?: CSSRules,
  ) {
    const parsedAttributes = parseAttributes(
      element,
      FabricText.ATTRIBUTE_NAMES,
      cssRules,
    );

    const {
      textAnchor = LEFT as typeof LEFT | typeof CENTER | typeof RIGHT,
      textDecoration = '',
      dx = 0,
      dy = 0,
      top = 0,
      left = 0,
      fontSize = DEFAULT_SVG_FONT_SIZE,
      strokeWidth = 1,
      ...restOfOptions
    } = { ...options, ...parsedAttributes };

    const textContent = (element.textContent || '')
      .replace(/^\s+|\s+$|\n+/g, '')
      .replace(/\s+/g, ' ');

    // this code here is probably the usual issue for SVG center find
    // this can later looked at again and probably removed.

    const text = new this(textContent, {
        left: left + dx,
        top: top + dy,
        underline: textDecoration.includes('underline'),
        overline: textDecoration.includes('overline'),
        linethrough: textDecoration.includes('line-through'),
        // we initialize this as 0
        strokeWidth: 0,
        fontSize,
        ...restOfOptions,
      }),
      textHeightScaleFactor = text.getScaledHeight() / text.height,
      lineHeightDiff =
        (text.height + text.strokeWidth) * text.lineHeight - text.height,
      scaledDiff = lineHeightDiff * textHeightScaleFactor,
      textHeight = text.getScaledHeight() + scaledDiff;

    let offX = 0;
    /*
      Adjust positioning:
        x/y attributes in SVG correspond to the bottom-left corner of text bounding box
        fabric output by default at top, left.
    */
    if (textAnchor === CENTER) {
      offX = text.getScaledWidth() / 2;
    }
    if (textAnchor === RIGHT) {
      offX = text.getScaledWidth();
    }
    text.set({
      left: text.left - offX,
      top:
        text.top -
        (textHeight - text.fontSize * (0.07 + text._fontSizeFraction)) /
          text.lineHeight,
      strokeWidth,
    });
    return text;
  }

  /* _FROM_SVG_END_ */

  /**
   * Returns FabricText instance from an object representation
   * @param {Object} object plain js Object to create an instance from
   * @returns {Promise<FabricText>}
   */
  static fromObject<
    T extends TOptions<SerializedTextProps>,
    S extends FabricText,
  >(object: T) {
    return this._fromObject<S>(
      {
        ...object,
        styles: stylesFromArray(object.styles || {}, object.text),
      },
      {
        extraParam: 'text',
      },
    );
  }
}

applyMixins(FabricText, [TextSVGExportMixin]);
classRegistry.setClass(FabricText);
classRegistry.setSVGClass(FabricText);
