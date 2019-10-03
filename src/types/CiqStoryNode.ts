import { isElement, valueOrUndefined } from '../util';
import { CiqStoryNodeId } from './';
const ciqStoryNodeIdFactory = new CiqStoryNodeId();
export class CiqStoryNode {
  nodeId: string;
  nodeType: number;
  tagName: string | undefined;
  attributes: Record<string, string> | undefined; // only really for elements
  nodeValue: string | undefined; // only really for text nodes
  constructor(node: Node) {
    const nodeType = node.nodeType;
    this.nodeType = nodeType;
    this.nodeId = ciqStoryNodeIdFactory.getStoryNodeId(node);
    if (nodeType === 3 || nodeType === 8) {
      this.nodeValue = valueOrUndefined(node.nodeValue);
    }
    if (node.nodeType === 1) {
      this.tagName = (node as Element).tagName;
    }
    if (isElement(node) && node.attributes.length) {
      this.attributes = {};
      //  it looks and acts like an array but is really a NamedNodeMap
      // tslint:disable-next-line: prefer-for-of
      for (let n = 0; n < node.attributes.length; n++) {
        const attr = node.attributes[n];
        this.attributes[attr.name] = attr.value;
      }
    }
  }

}