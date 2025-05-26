import { Path } from '../Path';
import { classRegistry } from '../../ClassRegistry';
import type { TextboxProps } from '../Textbox';
import type { TOptions, TClassProperties } from '../../typedefs';
import type { SerializedObjectProps } from '../Object/types';
import type { GroupProps } from '../Group';
import { Group } from '../Group';
import type { DrawContext } from '../Object/Object';
import { LayoutManager } from '../../LayoutManager';
import { OlpShapeLayoutStrategy } from './OlpShapeLayoutStrategy';
import { OlpTextbox } from './OlpTextbox';

// 扁平化默认值
export const olpshapeDefaultValues: Partial<TClassProperties<OlpShape>> = {
  shapeType: 'rect',
  shapeCustomPath: undefined,
  shapeViewBox: undefined,
  content: '',
  fontSize: 12,
  textBodyLIns: 10,
  textBodyTIns: 10,
  textBodyRIns: 10,
  textBodyBIns: 10,
  textAnchor: 'middleCenter',
  textFill: '#fff',
  hoverCursor: 'move',
};

interface UniqueOlpShapeProps {
  content: string;
  textBodyLIns?: number;
  textBodyTIns?: number;
  textBodyRIns?: number;
  textBodyBIns?: number;
  textAnchor?: 'middleCenter' | 'top' | 'topCenter' | 'bottomCenter' | 'middle';
  shapeType?: string;
  shapeCustomPath?: string;
  shapeViewBox?: number[];
  textFill?: string;
}

export interface SerializedPathProps
  extends SerializedObjectProps,
    UniqueOlpShapeProps {}

export interface OlpShapeProps
  extends GroupProps,
    Omit<TextboxProps, 'path'>,
    UniqueOlpShapeProps {}

export class OlpShape<
  Props extends TOptions<OlpShapeProps> = Partial<OlpShapeProps>,
> extends Group {
  public textboxMaxWidth = 0;

  static type = 'OlpShape';

  static ownDefaults = olpshapeDefaultValues;

  declare shapeType?: string;
  declare shapeCustomPath?: string;
  declare shapeViewBox?: number[];
  declare content: '';
  declare fontSize: number;
  declare textBodyLIns: number;
  declare textBodyTIns: number;
  declare textBodyRIns: number;
  declare textBodyBIns: number;
  declare textAlign: string;
  declare textAnchor:
    | 'top'
    | 'middle'
    | 'bottom'
    | 'topCenter'
    | 'middleCenter'
    | 'bottomCenter';
  declare textFill: string;

  declare wrap: boolean;

  constructor(options: Props) {
    const mergeOptions: any = {
      ...olpshapeDefaultValues,
      ...options,
      hasBorders: false,
    };
    const { shapeType, shapeCustomPath, shapeViewBox, width, height } =
      mergeOptions;
    let pathData = '';
    let scaleX = 1;
    let scaleY = 1;
    if (shapeType) {
      if (shapeType === 'rect') {
        pathData = `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`;
      }
    } else if (shapeCustomPath && width && height && shapeViewBox) {
      pathData = shapeCustomPath;
      scaleX = width / shapeViewBox[0];
      scaleY = height / shapeViewBox[1];
    }

    const path = new Path(pathData, {
      ...options,
      scaleX,
      scaleY,
      left: 0,
      top: 0,
      hasControls: false,
      hasBorders: false,
      interactive: false,
      strokeUniform: true,
      evented: false,
    });
    const textbox = new OlpTextbox(mergeOptions.content, {
      textAlign: mergeOptions.textAlign,
      textAnchor: mergeOptions.textAnchor,
      textBodyLIns: mergeOptions.textBodyLIns,
      textBodyTIns: mergeOptions.textBodyTIns,
      textBodyRIns: mergeOptions.textBodyRIns,
      textBodyBIns: mergeOptions.textBodyBIns,
      wrap: mergeOptions.wrap,
      splitByGrapheme: mergeOptions.wrap,
      editable: true,
      left: 0,
      top: 0,
      width:
        options.width! - mergeOptions.textBodyLIns - mergeOptions.textBodyRIns,
      seletable: true,
      visible: true,
      lockMovementX: true,
      lockMovementY: true,
      hasControls: false,
      hasBorders: true,
      hoverCursor: 'text',
      interactive: true,
      borderColor: 'orange',
    });

    super([path, textbox], {
      hasControls: true,
      padding: 0,
      hasBorders: true,
      interactive: true,
      subTargetCheck: true,
      left: options.left,
      top: options.top,
      width: options.width,
      height: options.height,
      borderDashArray: undefined,
      layoutManager: new LayoutManager(new OlpShapeLayoutStrategy()),
    });
    Object.assign(this, mergeOptions);
    this.setOptions(options);
    this.objectCaching = false;
    textbox.initDimensions();
  }

  getPathOptions() {
    const { shapeType, shapeCustomPath, shapeViewBox } = this;
    const { width, height } = this;
    let pathData = '';
    let scaleX = 1;
    let scaleY = 1;
    if (shapeType) {
      if (shapeType === 'rect') {
        pathData = `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`;
      }
    } else if (shapeCustomPath && width && height && shapeViewBox) {
      pathData = shapeCustomPath;
      scaleX = width / shapeViewBox[0];
      scaleY = height / shapeViewBox[1];
    }
    return {
      pathData,
      scaleX,
      scaleY,
    };
  }
  drawObject(
    ctx: CanvasRenderingContext2D,
    forClipping: boolean | undefined,
    context: DrawContext,
  ) {
    this._renderBackground(ctx);
    this._render(ctx);
    this._drawClipPath(ctx, this.clipPath, context);
  }
  _render(ctx: CanvasRenderingContext2D): void {
    const shape = this._objects[0] as Path;
    const textbox = this._objects[1] as OlpTextbox;
    ctx.save();
    shape.render(ctx);
    ctx.restore();

    const transform = ctx.getTransform();
    ctx.save();
    const retina = this.canvas?.getRetinaScaling() || 1;
    ctx.setTransform(retina, 0, 0, retina, transform.e, transform.f);
    if (textbox.wrap) {
      console.log(
        this,
        this.width * this.scaleX - textbox.textBodyLIns - textbox.textBodyRIns,
      );
      textbox.set(
        'width',
        this.width * this.scaleX - textbox.textBodyLIns - textbox.textBodyRIns,
      );
      textbox.render(ctx);
    }
    ctx.restore();
  }
}

classRegistry.setClass(OlpShape);
classRegistry.setSVGClass(OlpShape);
