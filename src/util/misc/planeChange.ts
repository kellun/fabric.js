import { iMatrix } from '../../constants';
import type { Point } from '../../Point';
import type { FabricObject } from '../../shapes/Object/Object';
import type { TMat2D } from '../../typedefs';
import { invertTransform, multiplyTransformMatrices } from './matrix';
import { applyTransformToObject } from './objectTransforms';

/**
 * We are actually looking for the transformation from the destination plane to the source plane (change of basis matrix)\
 * The object will exist on the destination plane and we want it to seem unchanged by it so we invert the destination matrix (`to`) and then apply the source matrix (`from`)
 * @param [from]
 * @param [to]
 * @returns
 */
export const calcPlaneChangeMatrix = (
  from: TMat2D = iMatrix,
  to: TMat2D = iMatrix,
) => multiplyTransformMatrices(invertTransform(to), from);

/**
 * 将一个点从源坐标平面发送到目标坐标平面。
 * 从画布/查看器的视角来看，该点保持不变。
 *
 * @示例 <caption>将点从画布平面发送到组平面</caption>
 * var obj = new Rect({ left: 20, top: 20, width: 60, height: 60, strokeWidth: 0 });
 * var group = new Group([obj], { strokeWidth: 0 });
 * var sentPoint1 = sendPointToPlane(new Point(50, 50), undefined, group.calcTransformMatrix());
 * var sentPoint2 = sendPointToPlane(new Point(50, 50), iMatrix, group.calcTransformMatrix());
 * console.log(sentPoint1, sentPoint2) //  两个点都输出 (0,0)，这是组的中心
 *
 * @param {Point} point 要转换的点
 * @param {TMat2D} [from] 包含对象的平面矩阵。传入 `undefined` 等同于传入单位矩阵，这意味着 `point` 存在于画布坐标平面中。
 * @param {TMat2D} [to] 要包含对象的目标平面矩阵。传入 `undefined` 意味着 `point` 应该被发送到画布坐标平面。
 * @returns {Point} 转换后的点
 */
export const sendPointToPlane = (
  // 要转换的点
  point: Point,
  // 源平面的变换矩阵，默认为单位矩阵
  from: TMat2D = iMatrix,
  // 目标平面的变换矩阵，默认为单位矩阵
  to: TMat2D = iMatrix,
): Point => {
  // 计算平面变换矩阵
  const planeChangeMatrix = calcPlaneChangeMatrix(from, to);
  // 对指定点应用平面变换矩阵
  return point.transform(planeChangeMatrix);
};

/**
 * See {@link sendPointToPlane}
 */
export const sendVectorToPlane = (
  point: Point,
  from: TMat2D = iMatrix,
  to: TMat2D = iMatrix,
): Point => point.transform(calcPlaneChangeMatrix(from, to), true);

/**
 *
 * A util that abstracts applying transform to objects.\
 * Sends `object` to the destination coordinate plane by applying the relevant transformations.\
 * Changes the space/plane where `object` is drawn.\
 * From the canvas/viewer's perspective `object` remains unchanged.
 *
 * @example <caption>Move clip path from one object to another while preserving it's appearance as viewed by canvas/viewer</caption>
 * let obj, obj2;
 * let clipPath = new Circle({ radius: 50 });
 * obj.clipPath = clipPath;
 * // render
 * sendObjectToPlane(clipPath, obj.calcTransformMatrix(), obj2.calcTransformMatrix());
 * obj.clipPath = undefined;
 * obj2.clipPath = clipPath;
 * // render, clipPath now clips obj2 but seems unchanged from the eyes of the viewer
 *
 * @example <caption>Clip an object's clip path with an existing object</caption>
 * let obj, existingObj;
 * let clipPath = new Circle({ radius: 50 });
 * obj.clipPath = clipPath;
 * let transformTo = multiplyTransformMatrices(obj.calcTransformMatrix(), clipPath.calcTransformMatrix());
 * sendObjectToPlane(existingObj, existingObj.group?.calcTransformMatrix(), transformTo);
 * clipPath.clipPath = existingObj;
 *
 * @param {FabricObject} object
 * @param {Matrix} [from] plane matrix containing object. Passing `undefined` is equivalent to passing the identity matrix, which means `object` is a direct child of canvas.
 * @param {Matrix} [to] destination plane matrix to contain object. Passing `undefined` means `object` should be sent to the canvas coordinate plane.
 * @returns {Matrix} the transform matrix that was applied to `object`
 */
export const sendObjectToPlane = (
  object: FabricObject,
  from?: TMat2D,
  to?: TMat2D,
): TMat2D => {
  const t = calcPlaneChangeMatrix(from, to);
  applyTransformToObject(
    object,
    multiplyTransformMatrices(t, object.calcOwnMatrix()),
  );
  return t;
};
