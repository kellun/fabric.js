import type { TClassProperties, TOptions } from '../../typedefs';
import type { ITextEvents } from '../IText/ITextBehavior';
import { JUSTIFY } from '../Text/constants';
import { Textbox } from '../Textbox';
import type {
  GraphemeData,
  SerializedTextboxProps,
  TextboxProps,
} from '../Textbox';

export const olptextboxDefaultValues: Partial<TClassProperties<OlpTextbox>> = {
  wrap: true,
  fit: 'none',
  textAnchor: 'middleCenter',
  textBodyLIns: 10,
  textBodyTIns: 10,
  textBodyRIns: 10,
  textBodyBIns: 10,
};
export interface UniqueOlpTextboxProps {
  wrap: boolean;
  fit: 'none' | 'resize' | 'shrink';
  textBodyLIns?: number;
  textBodyTIns?: number;
  textBodyRIns?: number;
  textBodyBIns?: number;
  textAnchor?:
    | 'top'
    | 'middle'
    | 'bottom'
    | 'topCenter'
    | 'middleCenter'
    | 'bottomCenter';
}
export interface SerializedOlpTextboxProps
  extends SerializedTextboxProps,
    Pick<UniqueOlpTextboxProps, 'wrap' | 'fit'> {}

export interface OlpTextboxProps extends TextboxProps, UniqueOlpTextboxProps {}

export class OlpTextbox<
  Props extends TOptions<OlpTextboxProps> = Partial<OlpTextboxProps>,
  SProps extends SerializedTextboxProps = SerializedTextboxProps,
  EventSpec extends ITextEvents = ITextEvents,
> extends Textbox<Props, SProps, EventSpec> {
  /**
   * 形状中文字自动换行
   */
  declare wrap: boolean;

  /**
   * none: 不自动调整形状大小
   * resize: 根据文本宽度自动调整形状大小
   * shrink: 溢出时缩小文字
   */
  declare fit: 'none' | 'resize' | 'shrink';
  declare textBodyLIns: number;
  declare textBodyTIns: number;
  declare textBodyRIns: number;
  declare textBodyBIns: number;
  public textboxMaxWidth = 0;
  maxLineWidth: number = 0;

  static ownDefaults = olptextboxDefaultValues;

  static type = 'OlpTextbox';
  declare textAnchor?:
    | 'top'
    | 'middle'
    | 'bottom'
    | 'topCenter'
    | 'middleCenter'
    | 'bottomCenter';

  static getDefaults(): Record<string, any> {
    return {
      ...super.getDefaults(),
      ...OlpTextbox.ownDefaults,
    };
  }

  constructor(text: string, options?: Props) {
    super(text, { ...OlpTextbox.ownDefaults, ...options } as Props);
  }
  /**
   * Unlike superclass's version of this function, Textbox does not update
   * its width.
   * @private
   * @override
   */
  initDimensions() {
    if (!this.initialized) {
      return;
    }
    this.isEditing && this.initDelayedCursor();
    this._clearCache();
    // clear dynamicMinWidth as it will be different after we re-wrap line
    this.dynamicMinWidth = 0;
    this.textboxMaxWidth =
      (this.group?.width || 0) * (this.group?.scaleX || 1) -
      this.textBodyLIns -
      this.textBodyRIns;
    // wrap lines
    this._styleMap = this._generateStyleMap(this._splitText());
    // if after wrapping, the width is smaller than dynamicMinWidth, change the width and re-wrap

    if (this.width) {
      if (this.width > this.maxLineWidth) {
        this._set('width', Math.max(this.dynamicMinWidth, this.maxLineWidth));
      }
    } else {
      this._set('width', Math.max(this.dynamicMinWidth, this.maxLineWidth));
    }

    if (this.textAlign.includes(JUSTIFY)) {
      // once text is measured we need to make space fatter to make justified text.
      this.enlargeSpaces();
    }
    // clear cache and re-calculate height
    this.height = this.calcTextHeight();
    this.calcLeftTop();
  }

  _wrapText(lines: string[], desiredWidth: number): string[][] {
    this.maxLineWidth = 0;
    return super._wrapText(lines, desiredWidth);
  }

  _wrapLine(
    lineIndex: number,
    desiredWidth: number,
    { largestWordWidth, wordsData }: GraphemeData,
    reservedSpace = 0,
  ): string[][] {
    const additionalSpace = this._getWidthOfCharSpacing(),
      splitByGrapheme = this.splitByGrapheme,
      graphemeLines = [],
      infix = splitByGrapheme ? '' : ' ';

    let lineWidth = 0,
      line: string[] = [],
      // spaces in different languages?
      offset = 0,
      infixWidth = 0,
      lineJustStarted = true;

    desiredWidth -= reservedSpace;

    const maxWidth = Math.max(
      desiredWidth,
      largestWordWidth,
      this.dynamicMinWidth,
    );
    // layout words
    const data = wordsData[lineIndex];
    offset = 0;
    let i;
    for (i = 0; i < data.length; i++) {
      const { word, width: wordWidth } = data[i];
      offset += word.length;

      lineWidth += infixWidth + wordWidth - additionalSpace;
      if (lineWidth > maxWidth && !lineJustStarted && this.wrap) {
        graphemeLines.push(line);
        line = [];
        lineWidth = wordWidth;
        lineJustStarted = true;
      } else {
        lineWidth += additionalSpace;
      }

      if (!lineJustStarted && !splitByGrapheme) {
        line.push(infix);
      }
      line = line.concat(word);

      infixWidth = splitByGrapheme
        ? 0
        : this._measureWord([infix], lineIndex, offset);
      offset++;
      lineJustStarted = false;
    }

    this.maxLineWidth = Math.max(this.maxLineWidth || 0, lineWidth);

    i && graphemeLines.push(line);

    // TODO: this code is probably not necessary anymore.
    // it can be moved out of this function since largestWordWidth is now
    // known in advance
    if (largestWordWidth + reservedSpace > this.dynamicMinWidth) {
      this.dynamicMinWidth = largestWordWidth - additionalSpace + reservedSpace;
    }
    return graphemeLines;
  }

  calcLeftTop() {
    const shape = this.group;
    const actualWidth = shape?.width || 0;
    const actualHeight = shape?.height || 0;
    const halfWidth = actualWidth / 2;
    const halfHeight = actualHeight / 2;
    const textboxHalfWidth = this.width / 2;
    const textboxHalfHeight = this.height / 2;
    let left = 0;
    let top = 0;

    switch (this.textAnchor) {
      case 'top':
        left = this.setLeftPosition(halfWidth, textboxHalfWidth);
        top = -halfHeight + this.textBodyTIns;
        break;
      case 'middle':
        left = this.setLeftPosition(halfWidth, textboxHalfWidth);
        top = -textboxHalfHeight;
        break;
      case 'bottom':
        left = this.setLeftPosition(halfWidth, textboxHalfWidth);
        top = halfHeight - this.height - this.textBodyBIns;
        break;
      case 'topCenter':
        left = -textboxHalfWidth;
        top = -halfHeight + this.textBodyTIns;
        break;
      case 'middleCenter':
        left = -textboxHalfWidth;
        top = -textboxHalfHeight;
        break;
      case 'bottomCenter':
        left = -textboxHalfWidth;
        top = halfHeight - this.height - this.textBodyBIns;
        break;
    }
    this.set({ left, top });
  }

  private setLeftPosition(halfWidth: number, textboxHalfWidth: number): number {
    let left = 0;
    if (this.textAlign === 'center') {
      left = -textboxHalfWidth;
    } else if (this.textAlign === 'right') {
      left = halfWidth - this.width - this.textBodyRIns;
    } else {
      left = -halfWidth + this.textBodyLIns;
    }
    return left;
  }
}
