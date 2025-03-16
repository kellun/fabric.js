import { Path } from '../Path';
import { classRegistry } from '../../ClassRegistry';
import { Textbox, TextboxProps } from '../Textbox';
import type { TOptions, TClassProperties } from '../../typedefs';
import type { SerializedObjectProps } from '../Object/types';
import { Group, GroupProps } from '../Group';
import { DrawContext } from '../Object/Object';
import {
  LayoutManager,
  LayoutStrategy,
  LayoutStrategyResult,
  StrictLayoutContext,
} from '../../LayoutManager';
import {
  LAYOUT_TYPE_IMPERATIVE,
  LAYOUT_TYPE_INITIALIZATION,
} from '../../LayoutManager/constants';
import { Point } from '../../Point';
import { getObjectBounds } from '../../LayoutManager/LayoutStrategies/utils';
import type { FabricObject } from '../../shapes/Object/FabricObject';
import { makeBoundingBoxFromPoints } from '../../util/misc/boundingBoxFromPoints';

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

class OlpShapeLayoutStrategy extends LayoutStrategy {
  static readonly type = 'olp-shape-strategy';
  calcBoundingBox(
    objects: FabricObject[],
    context: StrictLayoutContext,
  ): LayoutStrategyResult | undefined {
    const { type, target } = context;
    if (type === LAYOUT_TYPE_IMPERATIVE && context.overrides) {
      return context.overrides;
    }
    if (objects.length === 0) {
      return;
    }

    const { left, top, width, height } = makeBoundingBoxFromPoints(
      [objects[0]]
        .map((object) => getObjectBounds(target, object))
        .reduce<Point[]>((coords, curr) => coords.concat(curr), []),
    );
    const bboxSize = new Point(width, height);
    const bboxLeftTop = new Point(left, top);
    const bboxCenter = bboxLeftTop.add(bboxSize.scalarDivide(2));

    if (type === LAYOUT_TYPE_INITIALIZATION) {
      const actualSize = this.getInitialSize(context, {
        size: bboxSize,
        center: bboxCenter,
      });
      return {
        // in `initialization` we do not account for target's transformation matrix
        center: bboxCenter,
        // TODO: investigate if this is still necessary
        relativeCorrection: new Point(0, 0),
        size: actualSize,
      };
    } else {
      //  we send `relativeCenter` up to group's containing plane
      const center = bboxCenter.transform(target.calcOwnMatrix());
      return {
        center,
        size: bboxSize,
      };
    }
  }
}

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
    const textboxMaxWidth =
      mergeOptions.width * (mergeOptions.scaleX || 1) -
      mergeOptions.textBodyLIns -
      mergeOptions.textBodyRIns;
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
    });
    const textbox = new Textbox(mergeOptions.content, {
      fontSize: mergeOptions.fontSize,
      textAlign: mergeOptions.textAlign,
      fill: mergeOptions.textFill,
      editable: true,
      left: 0,
      top: 0,
      width: textboxMaxWidth,
      seletable: true,
      visible: true,
      lockMovementX: true,
      lockMovementY: true,
      hasControls: false,
      hasBorders: true,
      hoverCursor: 'text',
      interactive: false,
      splitByGrapheme: mergeOptions.wrap,
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

    this.textboxMaxWidth = textboxMaxWidth;

    this.objectCaching = false;
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
    // this._drawClipPath(ctx, this.clipPath, context);
  }
  _render(ctx: CanvasRenderingContext2D): void {
    this.dirty = true;
    const shape = this._objects[0] as Path;
    const textbox = this._objects[1] as Textbox;
    ctx.save();
    shape.render(ctx);
    ctx.restore();
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

    const actualWidth = shape.width;
    const actualHeight = shape.height;
    const halfWidth = actualWidth / 2;
    const halfHeight = actualHeight / 2;
    const textboxHalfWidth = textbox.width / 2;
    const textboxHalfHeight = textbox.height / 2;

    let left = 0;
    let top = 0;
    let width = textbox.width;
    let splitByGrapheme = textbox.splitByGrapheme;

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

    if (this.wrap) {
      width = this.textboxMaxWidth;
      splitByGrapheme = true;
    }
    textbox.set({ left, top, width, splitByGrapheme });

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
