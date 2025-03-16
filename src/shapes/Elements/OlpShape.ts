import { Path } from '../Path';
import type { PathProps } from '../Path';
import { classRegistry } from '../../ClassRegistry';
import { Textbox, TextboxProps } from '../Textbox';
import type { FabricObject } from '../Object/Object';
import type { TOptions, TClassProperties } from '../../typedefs';
import type { SerializedObjectProps } from '../Object/types';
import type { ObjectEvents } from '../../EventTypeDefs';

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
};

interface UniqueOlpShapeProps {
  content: '';
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
  extends PathProps,
    Omit<TextboxProps, 'path'>,
    UniqueOlpShapeProps {}

export class OlpShape<
  Props extends TOptions<OlpShapeProps> = Partial<OlpShapeProps>,
  SProps extends SerializedPathProps = SerializedPathProps,
  EventSpec extends ObjectEvents = ObjectEvents,
> extends Path<Props, SProps, EventSpec> {
  public textboxMaxWidth = 0;

  public _objects: FabricObject[] = [];

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

  constructor(options: Props) {
    super('');
    Object.assign(this, OlpShape.ownDefaults);
    this.setOptions(options);
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
    this.set('scaleX', scaleX);
    this.set('scaleY', scaleY);
    this._setPath(pathData, false);
    const { textBodyLIns, textBodyRIns } = this;

    this.textboxMaxWidth =
      this.width * (options.scaleX || 1) - textBodyLIns - textBodyRIns;

    const textbox = new Textbox(this.content, {
      fontSize: this.fontSize,
      textAlign: this.textAlign,
      fill: this.textFill,
      editable: true,
      left: 0,
      top: 0,
      seletable: true,
      hasControls: false,
      visible: this.content ? true : false,
      lockMovementX: true,
      lockMovementY: true,
      hasBorders: false,
      hoverCursor: 'text',
      interactive: true,
    });
    this.objectCaching = false;

    this._objects = [textbox];

    textbox.belongsToObject = this;
  }
  _render(ctx: CanvasRenderingContext2D): void {
    super._render(ctx);
    const textbox = this._objects[0] as Textbox;

    ctx.save();
    const transform = ctx.getTransform();
    const retinaScaling = this.canvas!.getRetinaScaling();
    ctx.setTransform(
      retinaScaling,
      0,
      0,
      retinaScaling,
      transform.e,
      transform.f,
    );

    const actualWidth = this.width * transform.a;
    const actualHeight = this.height * transform.d;
    const halfWidth = actualWidth / 2;
    const halfHeight = actualHeight / 2;
    const textboxHalfWidth = textbox.width / 2;
    const textboxHalfHeight = textbox.height / 2;

    let left = 0;
    let top = 0;

    switch (this.textAnchor) {
      case 'top':
        left = this.setLeftPosition(textbox, halfWidth, textboxHalfWidth);
        top = -halfHeight + this.textBodyTIns;
        break;
      case 'middle':
        left = this.setLeftPosition(textbox, halfWidth, textboxHalfWidth);
        top = -textboxHalfHeight;
        break;
      case 'bottom':
        left = this.setLeftPosition(textbox, halfWidth, textboxHalfWidth);
        top = halfHeight - textbox.height - this.textBodyBIns;
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
        top = halfHeight - textbox.height - this.textBodyBIns;
        break;
    }

    textbox.set({ left, top });
    if (!textbox.canvas) {
      textbox._set('canvas', this.canvas);
    }

    textbox.objectCaching = false;
    textbox.render(ctx);
    ctx.restore();
  }

  private setLeftPosition(
    textbox: Textbox,
    halfWidth: number,
    textboxHalfWidth: number,
  ): number {
    let left = 0;
    if (this.textAlign === 'center') {
      left = -textboxHalfWidth;
    } else if (this.textAlign === 'right') {
      left = halfWidth - textbox.width - this.textBodyRIns;
    } else {
      left = -halfWidth + this.textBodyLIns;
    }
    return left;
  }
}

classRegistry.setClass(OlpShape);
classRegistry.setSVGClass(OlpShape);
