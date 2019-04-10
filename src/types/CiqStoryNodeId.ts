export type CiqStoryRawNode = Node & { __ciqStoryNodeId?: string };

export class CiqStoryNodeId extends String {
  public static getStoryNodeId(node: CiqStoryRawNode, debug?: boolean): string {
    if (node === document) {
      return 'document';
    }
    if (!node.__ciqStoryNodeId) {
      node.__ciqStoryNodeId = ++CiqStoryNodeId.highestNodeId + '';
    }
    return node.__ciqStoryNodeId;
  }
  private static highestNodeId: number = 0;
}