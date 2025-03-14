import { Path } from '../Path';
import type { PathProps } from '../Path';
import { classRegistry } from '../../ClassRegistry';
import { Textbox } from '../Textbox';
import type { TextboxProps } from '../Textbox';
import type { FabricObject } from '../Object/Object';
import type { TOptions, TClassProperties } from '../../typedefs';
import type { SerializedObjectProps } from '../Object/types';
import type { ObjectEvents } from '../../EventTypeDefs';

export const olpshapeDefaultValues: Partial<TClassProperties<OlpShape>> = {
  shapeStyle: {
    type: 'rect',
  },
  textBody: {
    bodyStyle: {
      fontSize: 12,
      lIns: 30,
      tIns: 10,
      rIns: 30,
      bIns: 10,
      anchor: 'MiddleCenter',
    },
    content: '',
  },
};

interface UniqueOlpShapeProps {
  textBody?: {
    bodyStyle?: TextboxProps & {
      anchor?: 'MiddleCenter' | 'TopLeft';
      lIns?: number;
      tIns?: number;
      rIns?: number;
      bIns?: number;
    };
    content: '';
  };
  shapeStyle: {
    type?: string;
    customPath?: string;
    viewBox?: number[];
  };
}

export interface SerializedPathProps
  extends SerializedObjectProps,
    UniqueOlpShapeProps {}

export interface OlpShapeProps extends PathProps, UniqueOlpShapeProps {}

export class OlpShape<
  Props extends TOptions<OlpShapeProps> = Partial<OlpShapeProps>,
  SProps extends SerializedPathProps = SerializedPathProps,
  EventSpec extends ObjectEvents = ObjectEvents,
> extends Path<Props, SProps, EventSpec> {
  public textboxMaxWidth = 0;

  public _objects: FabricObject[] = [];

  static type = 'OlpShape';

  static ownDefaults = olpshapeDefaultValues;

  declare shapeStyle: {
    type?: string;
    customPath?: string;
    viewBox?: number[];
  };

  declare textBody: {
    bodyStyle: Partial<TextboxProps> & {
      anchor: 'MiddleCenter' | 'TopLeft';
      lIns: number;
      tIns: number;
      rIns: number;
      bIns: number;
    };
    content: '';
  };

  constructor(options: Props) {
    super('');
    Object.assign(this, OlpShape.ownDefaults);
    this.setOptions(options);
    const { type, customPath, viewBox } = this.shapeStyle;
    const { width, height } = this;
    let pathData = '';
    let scaleX = 1;
    let scaleY = 1;
    if (type) {
      if (type === 'rect') {
        pathData = `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`;
      }
    } else if (customPath && width && height && viewBox) {
      pathData = customPath;
      scaleX = width / viewBox[0];
      scaleY = height / viewBox[1];
    }
    this.set('scaleX', scaleX);
    this.set('scaleY', scaleY);
    this._setPath(pathData, false);
    const { lIns, rIns } = this.textBody.bodyStyle;

    this.textboxMaxWidth = this.width * (options.scaleX || 1) - lIns - rIns;

    const textbox = new Textbox(this.textBody.content, {
      ...this.textBody.bodyStyle,
      width: this.textboxMaxWidth,
      textAlign: 'center',
      editable: true,
      left: 0,
      top: 0,
      seletable: true,
      hasControls: false,
      visible: this.textBody.content ? true : false,
      splitByGrapheme: true,
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
    ctx.setTransform(1, 0, 0, 1, transform.e, transform.f);

    const textboxWidth = this.textboxMaxWidth * this.scaleX;
    console.log('textboxWidth', transform);
    if (this.textBody.bodyStyle.anchor === 'TopLeft') {
      textbox.set({
        left: -textboxWidth / 2,
        top: -this.height / 2 + this.textBody.bodyStyle.tIns,
      });
    } else {
      textbox.set({
        left: -textboxWidth / 2,
        top: -textbox.height / 2,
        width: textboxWidth,
      });
    }
    if (!textbox.canvas) {
      textbox._set('canvas', this.canvas);
    }

    textbox.objectCaching = false;
    textbox.render(ctx);
    ctx.restore();
  }
}

classRegistry.setClass(OlpShape);
classRegistry.setSVGClass(OlpShape);
