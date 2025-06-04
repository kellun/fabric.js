import { classRegistry } from '../../ClassRegistry';
import type { TClassProperties, TOptions } from '../../typedefs';
import { Textbox } from '../Textbox';
import { Group, type GroupProps } from '../Group';
import { LayoutManager } from '../../LayoutManager/LayoutManager';
import { FixedLayout } from '../../LayoutManager/LayoutStrategies/FixedLayout';

export const olpTableCellDefaultValues: Partial<
  TClassProperties<OlpTableCell>
> = {
  content: {
    paragraphs: [
      {
        textRuns: [{ text: '标题1' }],
      },
    ],
  },
  properties: {
    fillColor: 'blue',
    bold: true,
  },
  padding: 0,
};

export interface UniqueOlpTableCellProps {
  content?: {
    textProperties?: TextFormatting;
    paragraphs: Paragraph[]; // 文本段落
  };
  properties?: TableCellFormatting;
}

interface TableCellFormatting {
  rowSpan?: number; // 跨行数
  colSpan?: number; // 跨列数
  fillColor?: string; // 填充色（如 "#FF0000"）
  borders?: {
    left?: BorderStyle;
    right?: BorderStyle;
    top?: BorderStyle;
    bottom?: BorderStyle;
  };
  bold?: boolean; // 是否加粗
}

// 文本相关类型
interface TextFormatting {
  wrapText?: boolean;
  rightToLeft?: boolean;
  // 其他文本属性...
}

interface Paragraph {
  textRuns: TextRun[]; // 文本片段
  // 段落格式...
}

interface TextRun {
  text: string; // 实际文本内容
  // 字体样式...
}

interface BorderStyle {
  width?: number; // 边框宽度
  color?: string; // 边框颜色（如 "#000000"）
}

export interface OlpTableCellProps
  extends GroupProps,
    UniqueOlpTableCellProps {}

export class OlpTableCell<
    Props extends TOptions<OlpTableCellProps> = Partial<OlpTableCellProps>,
  >
  extends Group
  implements OlpTableCellProps
{
  declare textBox: Textbox;
  declare content?: UniqueOlpTableCellProps['content'];
  declare properties?: UniqueOlpTableCellProps['properties'];
  static ownDefaults = olpTableCellDefaultValues;
  static getDefaults(): Record<string, any> {
    return { ...super.getDefaults(), ...OlpTableCell.ownDefaults };
  }

  /**
   * Constructor
   * @param {Object} [options] Options object
   */
  constructor(options?: Props) {
    super(
      [
        new Textbox('单元格', {
          width: options?.width,
          height: options?.height,
          fill: '#fff',
          left: 0,
          top: 0,
        }),
      ],
      {
        hasControls: false,
        subTargetCheck: true,
        interactive: true,
        layoutManager: new LayoutManager(new FixedLayout()),
      },
    );

    Object.assign(this, OlpTableCell.ownDefaults);
    this.setOptions(options);
  }

  _renderBackground(ctx: CanvasRenderingContext2D) {
    if (!this.backgroundColor && !this.properties?.fillColor) {
      return;
    }
    const dim = this._getNonTransformedDimensions();
    ctx.fillStyle = this.properties?.fillColor || this.backgroundColor;

    ctx.fillRect(-dim.x / 2, -dim.y / 2, dim.x, dim.y);
    // if there is background color no other shadows
    // should be casted
    this._removeShadow(ctx);
  }

  /**
   * @private
   * @param {CanvasRenderingContext2D} ctx Context to render on
   */
  _render(ctx: CanvasRenderingContext2D) {}
}
classRegistry.setClass(OlpTableCell);
classRegistry.setSVGClass(OlpTableCell);
