import { CiqStoryNode } from './';

export type TwistType = 'childList' | 'attributes' | 'event' | 'resize';

export type BaseTwist = {
  timeSincePageLoad: number;
  targetNode?: CiqStoryNode;
};

export type TargetTwist = {
  targetNode: CiqStoryNode;
};

export type ChildListTwist = BaseTwist & TargetTwist & {
  type: 'childList';
  addedNodes: CiqStoryNode[];
  removedNodes: CiqStoryNode[];
};

export type AttributesTwist = BaseTwist & TargetTwist & {
  attributeName: string;
  attributeValue: string | undefined;
  type: 'attributes';
};

export type EventTwist = BaseTwist & {
  clientX?: number;
  clientY?: number;
  textValue?: string; // for input events
  eventType: string;
  type: 'event';
};

export type ResizeTwist = BaseTwist & {
  width: number;
  height: number;
  type: 'resize';
};

export type CiqStoryTwist = ChildListTwist | AttributesTwist | EventTwist | ResizeTwist;

export const createResizeTwist = (width: number, height: number): ResizeTwist => ({
  width,
  height,
  type: 'resize',
  timeSincePageLoad: performance.now()
});
export const createEventTwist = (
  eventType: string,
  targetNode?: CiqStoryNode,
  clientX?: number,
  clientY?: number,
  textValue?: string,
): EventTwist => ({
  eventType,
  targetNode,
  clientX,
  clientY,
  textValue,
  type: 'event',
  timeSincePageLoad: performance.now()
});
export const createAttributesTwist = (
  targetNode: CiqStoryNode,
  attributeName: string,
  attributeValue: string | undefined
): AttributesTwist => ({
  attributeName,
  attributeValue,
  targetNode,
  type: 'attributes',
  timeSincePageLoad: performance.now()
});

export const createChildListTwist = (
  targetNode: CiqStoryNode,
  addedNodes: CiqStoryNode[] = [],
  removedNodes: CiqStoryNode[] = []
): ChildListTwist => ({
  addedNodes,
  removedNodes,
  targetNode,
  type: 'childList',
  timeSincePageLoad: performance.now()
});