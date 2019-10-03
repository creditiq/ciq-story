import { IntId } from '../int-id';

export type CiqStoryRawNode = Node & { __ciqStoryNodeId?: string };

export class CiqStoryNodeId extends String {
  private intId: IntId = new IntId();
  public getStoryNodeId(node: CiqStoryRawNode, debug?: boolean): string {
    if (node === document) {
      return 'document';
    }
    if (!node.__ciqStoryNodeId) {
      node.__ciqStoryNodeId = this.intId.next().toString();
    }
    return node.__ciqStoryNodeId;
  }
}