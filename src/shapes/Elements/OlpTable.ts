import { classRegistry } from '../../ClassRegistry';
import type { TClassProperties, TOptions } from '../../typedefs';
import { Textbox } from '../Textbox';
import { Group, type GroupProps } from '../Group';
import { Rect } from '../Rect';

export const olpTableDefaultValues: Partial<TClassProperties<OlpTable>> = {
  properties: {
    firstRowHighlighted: true,
    bandedRows: false,
    styleId: 'SimpleTableStyle',
  },
  columns: [
    { width: 100 }, // 第1列宽 100px
    { width: 150 }, // 第2列宽 150px
    { width: 120 }, // 第3列宽 120px
  ],
  rows: [
    // 表头行
    {
      height: 40, // 行高 40px
      cells: [
        {
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
        },
        {
          content: {
            paragraphs: [
              {
                textRuns: [{ text: '标题2' }],
              },
            ],
          },
          properties: {
            fillColor: 'blue',
            bold: true,
          },
        },
        {
          content: {
            paragraphs: [
              {
                textRuns: [{ text: '标题3' }],
              },
            ],
          },
          properties: {
            fillColor: 'blue',
            bold: true,
          },
        },
      ],
    },
    // 数据行
    {
      height: 30,
      cells: [
        {
          content: {
            paragraphs: [
              {
                textRuns: [{ text: '数据1' }],
              },
            ],
          },
        },
        {
          content: {
            paragraphs: [
              {
                textRuns: [{ text: '数据2' }],
              },
            ],
          },
        },
        {
          content: {
            paragraphs: [
              {
                textRuns: [{ text: '数据3' }],
              },
            ],
          },
        },
      ],
    },
  ],
};

export interface UniqueOlpTableProps {
  properties?: TableProperties;
  columns: TableColumnDefinition[]; // 列宽定义
  rows: TableRow[]; // 表格行数据
}

interface TableProperties {
  firstRowHighlighted?: boolean; // 首行特殊格式
  bandedRows?: boolean; // 是否启用带状行
  styleId?: string; // 表格样式ID
}

interface TableColumnDefinition {
  width: number; // 列宽（单位：px）
}

interface TableRow {
  height: number; // 行高（单位：px）
  cells: TableCell[]; // 单元格数据
}

interface TableCell {
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

export interface OlpTableProps extends GroupProps, UniqueOlpTableProps {}

export class OlpTable<
    Props extends TOptions<OlpTableProps> = Partial<OlpTableProps>,
  >
  extends Group
  implements OlpTableProps
{
  declare rows: TableRow[];
  declare columns: TableColumnDefinition[];
  declare properties: TableProperties;
  declare cellTextboxes: Textbox[][]; // 存储所有单元格的Textbox对象
  static type = 'OlpTable';

  static ownDefaults = olpTableDefaultValues;
  // 在类定义中添加静态常量
  static DEFAULT_MIN_CELL_WIDTH = 30; // 默认最小单元格宽度
  static DEFAULT_MIN_CELL_HEIGHT = 20; // 默认最小单元格高度
  cells: Rect[][] = []; // 存储所有单元格的Rect对象

  static getDefaults(): Record<string, any> {
    return { ...super.getDefaults(), ...OlpTable.ownDefaults };
  }

  /**
   * Constructor
   * @param {Object} [options] Options object
   */
  constructor(options?: Props) {
    super();
    Object.assign(this, OlpTable.ownDefaults);
    this.cellTextboxes = [];
    this._calculateTableSize();
    this.setOptions(options);
    this._initializeTextboxes();
    this._initializeCell();
    this.add(...this.cells.flat()); // 添加所有单元格到Group中
    this.add(...this.cellTextboxes.flat()); // 添加所有Textbox到Group中
    console.log(this);
  }

  /**
   * @private
   * @param {CanvasRenderingContext2D} ctx Context to render on
   */
  _render(ctx: CanvasRenderingContext2D) {
    this._transformDone = true;
    this._calculateTableSize();
    super.render(ctx);
    this._transformDone = false;
  }

  private _renderTextboxes(ctx: CanvasRenderingContext2D) {
    ctx.save();

    this.cellTextboxes.forEach((row, rowIndex) => {
      row.forEach((textbox, colIndex) => {
        if (textbox) {
          // 更新Textbox位置和尺寸
          textbox.set({
            left: this._getCellLeft(colIndex),
            top: this._getCellTop(rowIndex),
            width: this._getCellWidth(
              colIndex,
              this.rows[rowIndex].cells[colIndex],
            ),
            height: this._getCellHeight(
              rowIndex,
              this.rows[rowIndex].cells[colIndex],
            ),
          });

          // 渲染Textbox
          textbox.render(ctx);
        }
      });
    });

    ctx.restore();
  }

  /**
   * 初始化所有单元格的Textbox
   */
  private _initializeTextboxes() {
    this.cellTextboxes = this.rows.map((row, rowIndex) => {
      return row.cells.map((cell, colIndex) => {
        const text = cell.content?.paragraphs?.[0]?.textRuns?.[0]?.text || '';

        return new Textbox(text, {
          left: this._getCellLeft(colIndex),
          top: this._getCellTop(rowIndex),
          width: this._getCellWidth(colIndex, cell),
          height: this._getCellHeight(rowIndex, cell),
          fontSize: 12,
          textAlign: 'center',
          hasControls: false,
          editable: true,
          rowIndex,
          colIndex,
          rowSpan: cell.properties?.rowSpan || 1,
          colSpan: cell.properties?.colSpan || 1,
          lockMovementY: true,
          lockMovementX: true,
          lockScalingX: true,
          lockScalingY: true,
          lockRotation: true,
          lockSkewingX: true,
          lockSkewingY: true,
        });
      });
    });
    console.log('Initialized Textboxes:', this.cellTextboxes);
  }

  private _initializeCell() {
    let currentY = -this.height / 2; // 从顶部开始绘制
    this.cells = this.rows.map((row, rowIndex) => {
      let currentX = -this.width / 2; // 从左侧开始绘制
      let cellIndex = 0;

      const rows = row.cells.map((cell, colIndex) => {
        // 跳过被合并的单元格
        if (cellIndex < colIndex) {
          currentX += this.columns[cellIndex].width;
          cellIndex++;
        }

        // 计算单元格实际宽高（考虑合并和最小值）
        const colSpan = cell.properties?.colSpan || 1;
        const rowSpan = cell.properties?.rowSpan || 1;

        let cellWidth = 0;
        for (let i = 0; i < colSpan; i++) {
          cellWidth += Math.max(
            this.columns[cellIndex + i].width,
            OlpTable.DEFAULT_MIN_CELL_WIDTH,
          );
        }

        let cellHeight = 0;
        for (let i = 0; i < rowSpan; i++) {
          cellHeight += Math.max(
            this.rows[rowIndex + i].height,
            OlpTable.DEFAULT_MIN_CELL_HEIGHT,
          );
        }

        // 创建单元格矩形
        const cellRect = new Rect({
          left: currentX,
          top: currentY,
          width: cellWidth,
          height: cellHeight,
          fill: cell.properties?.fillColor || '#f0f0f0', // 默认填充色
          stroke: '#000000', // 默认边框颜色
          strokeWidth: 1, // 默认边框宽度
          rowIndex: rowIndex,
          colIndex: colIndex,
          rowSpan: rowSpan,
          colSpan: colSpan,
          hasControls: false,
          lockMovementY: true,
          lockMovementX: true,
          lockScalingX: true,
          lockScalingY: true,
          lockRotation: true,
          lockSkewingX: true,
          lockSkewingY: true,
          id: `cell`,
        });

        // 添加到单元格数组
        return cellRect;
      });

      currentY += Math.max(row.height, OlpTable.DEFAULT_MIN_CELL_HEIGHT);
      return rows;
    });
    console.log('Initialized Cells:', this.cells);
  }

  /**
   * 获取单元格左边位置
   */
  private _getCellLeft(colIndex: number): number {
    return this.columns
      .slice(0, colIndex)
      .reduce(
        (sum, col) =>
          sum + Math.max(col.width, OlpTable.DEFAULT_MIN_CELL_WIDTH),
        0,
      );
  }

  /**
   * 获取单元格顶部位置
   */
  private _getCellTop(rowIndex: number): number {
    return this.rows
      .slice(0, rowIndex)
      .reduce(
        (sum, row) =>
          sum + Math.max(row.height, OlpTable.DEFAULT_MIN_CELL_HEIGHT),
        0,
      );
  }

  /**
   * 获取单元格宽度
   */
  private _getCellWidth(colIndex: number, cell: TableCell): number {
    const colSpan = cell.properties?.colSpan || 1;
    let width = 0;

    for (let i = 0; i < colSpan; i++) {
      width += Math.max(
        this.columns[colIndex + i]?.width || 0,
        OlpTable.DEFAULT_MIN_CELL_WIDTH,
      );
    }

    return width;
  }

  /**
   * 获取单元格高度
   */
  private _getCellHeight(rowIndex: number, cell: TableCell): number {
    const rowSpan = cell.properties?.rowSpan || 1;
    let height = 0;

    for (let i = 0; i < rowSpan; i++) {
      height += Math.max(
        this.rows[rowIndex + i]?.height || 0,
        OlpTable.DEFAULT_MIN_CELL_HEIGHT,
      );
    }

    return height;
  }

  _renderCells(ctx: CanvasRenderingContext2D) {
    // 保存当前绘图状态
    ctx.save();

    // 2. 绘制所有单元格背景
    let currentY = 0; // 从顶部开始绘制
    this.rows.forEach((row, rowIndex) => {
      let currentX = 0; // 从左侧开始绘制
      let cellIndex = 0;

      row.cells.forEach((cell, colIndex) => {
        // 跳过被合并的单元格
        if (cellIndex < colIndex) {
          currentX += this.columns[cellIndex].width;
          cellIndex++;
        }

        // 计算单元格实际宽高（考虑合并和最小值）
        const colSpan = cell.properties?.colSpan || 1;
        const rowSpan = cell.properties?.rowSpan || 1;

        let cellWidth = 0;
        for (let i = 0; i < colSpan; i++) {
          cellWidth += Math.max(
            this.columns[cellIndex + i].width,
            OlpTable.DEFAULT_MIN_CELL_WIDTH,
          );
        }

        let cellHeight = 0;
        for (let i = 0; i < rowSpan; i++) {
          cellHeight += Math.max(
            this.rows[rowIndex + i].height,
            OlpTable.DEFAULT_MIN_CELL_HEIGHT,
          );
        }

        // 绘制单元格背景
        ctx.fillStyle = cell.properties?.fillColor || '#f0f0f0'; // 默认填充色
        ctx.fillRect(currentX, currentY, cellWidth, cellHeight);

        // 移动到下一列
        currentX += Math.max(
          this.columns[cellIndex].width,
          OlpTable.DEFAULT_MIN_CELL_WIDTH,
        );
        cellIndex++;
      });

      currentY += Math.max(row.height, OlpTable.DEFAULT_MIN_CELL_HEIGHT);
    });

    // 3. 绘制所有边框（代码与之前相同，省略...）
    // 2. 绘制所有边框
    currentY = 0; // 从顶部开始绘制
    ctx.strokeStyle = '#000000'; // 默认边框颜色
    ctx.lineWidth = 1; // 默认边框宽度

    this.rows.forEach((row, _rowIndex) => {
      let currentX = 0; // 从左侧开始绘制
      let cellIndex = 0;

      row.cells.forEach((cell, colIndex) => {
        // 跳过被合并的单元格
        if (cellIndex < colIndex) {
          currentX += this.columns[cellIndex].width;
          cellIndex++;
        }

        const cellWidth =
          this.columns[cellIndex].width * (cell.properties?.colSpan || 1);
        const cellHeight = row.height * (cell.properties?.rowSpan || 1);

        // 绘制单元格边框
        if (cell.properties?.borders) {
          const { borders } = cell.properties;

          // 左边框
          if (borders.left) {
            ctx.strokeStyle = borders.left.color || '#000000';
            ctx.lineWidth = borders.left.width || 1;
            ctx.beginPath();
            ctx.moveTo(currentX, currentY);
            ctx.lineTo(currentX, currentY + cellHeight);
            ctx.stroke();
          }

          // 右边框
          if (borders.right) {
            ctx.strokeStyle = borders.right.color || '#000000';
            ctx.lineWidth = borders.right.width || 1;
            ctx.beginPath();
            ctx.moveTo(currentX + cellWidth, currentY);
            ctx.lineTo(currentX + cellWidth, currentY + cellHeight);
            ctx.stroke();
          }

          // 上边框
          if (borders.top) {
            ctx.strokeStyle = borders.top.color || '#000000';
            ctx.lineWidth = borders.top.width || 1;
            ctx.beginPath();
            ctx.moveTo(currentX, currentY);
            ctx.lineTo(currentX + cellWidth, currentY);
            ctx.stroke();
          }

          // 下边框
          if (borders.bottom) {
            ctx.strokeStyle = borders.bottom.color || '#000000';
            ctx.lineWidth = borders.bottom.width || 1;
            ctx.beginPath();
            ctx.moveTo(currentX, currentY + cellHeight);
            ctx.lineTo(currentX + cellWidth, currentY + cellHeight);
            ctx.stroke();
          }
        } else {
          // 默认绘制所有边框
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1;
          ctx.strokeRect(currentX, currentY, cellWidth, cellHeight);
        }

        // 移动到下一列
        currentX += this.columns[cellIndex].width;
        cellIndex++;
      });

      currentY += row.height;
    });
    // 恢复绘图状态
    ctx.restore();
  }

  /**
   * 计算表格总尺寸并设置到实例属性
   */
  private _calculateTableSize() {
    // 计算总宽度（考虑最小宽度）
    const width = this.columns.reduce((sum, col) => {
      return sum + Math.max(col.width, OlpTable.DEFAULT_MIN_CELL_WIDTH);
    }, 0);

    // 计算总高度（考虑最小高度）
    const height = this.rows.reduce((sum, row) => {
      return sum + Math.max(row.height, OlpTable.DEFAULT_MIN_CELL_HEIGHT);
    }, 0);

    this._set('width', width);
    this._set('height', height);
  }
}

classRegistry.setClass(OlpTable);
classRegistry.setSVGClass(OlpTable);
