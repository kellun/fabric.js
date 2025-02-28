import { Path } from '../Path';
import { classRegistry } from '../../ClassRegistry';
import { Textbox } from '../Textbox';

export class OlpShape extends Path {
  public textbox: Textbox;
  public shapePadding = [0, 30, 0, 30];
  public textboxWidth = 0;
  static type = 'OlpShape';

  constructor(options: any = {}) {
    const {
      width,
      height,
      shapeStyle: { type, customPath, viewBox },
    } = options;
    let pathData = '';
    let scaleX = 1;
    let scaleY = 1;
    if (type) {
      if (type === 'rect') {
        pathData = `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`;
      }
    } else if (customPath) {
      pathData = customPath;
      scaleX = width / viewBox[0];
      scaleY = height / viewBox[1];
    }

    super(pathData, {
      ...options,
      scaleX,
      scaleY,
      cornerColor: 'white', // 控制点颜色
      cornerStyle: 'circle', // 圆形控制点
      cornerSize: 10, // 控制点大小
      cornerStrokeColor: 'black', // 控制点边框颜色
      cornerStrokeWidth: 2, // 控制点边框宽度
      transparentCorners: false, // 使控制点不透明
    });

    const padding = this.shapePadding;
    this.textboxWidth = options.width * (options.scaleX || 1) - padding[1] - padding[3];

    const textbox = new Textbox((options.text || {}).content || '', {
      ...(options.text || { style: {} }).style,
      width: this.textboxWidth,
      textAlign: 'center',
      editable: true,
      left: 0,
      top: 0,
      seletable: true,
      hasControls: false,
      visible: options.text ? true : false,
      splitByGrapheme: true,
      lockMovementX: true,
      lockMovementY: true,
      hasBorders: false,
      hoverCursor: 'text',
    });

    this.objectCaching = false;

    this.textbox = textbox;

    textbox.belongsToObject = this;
  }
  _render(ctx: CanvasRenderingContext2D): void {
    super._render(ctx);
    const padding = this.shapePadding;
    const scaleY = this.scaleY;
    const textbox = this.textbox;

    ctx.save()
    const transform = ctx.getTransform()
    ctx.setTransform(1, 0, 0, 1, transform.e, transform.f)
    const textboxWidth = this.textboxWidth * this.scaleX
    textbox.set({
      left: -textboxWidth / 2,
      top: -textbox.height / 2,
      width: textboxWidth,
    });
    if (!textbox.canvas) {
      textbox._set('canvas', this.canvas);
    }

    textbox.objectCaching = false;
    textbox.render(ctx);
    ctx.restore()
  }
}

classRegistry.setClass(OlpShape);
classRegistry.setSVGClass(OlpShape);
