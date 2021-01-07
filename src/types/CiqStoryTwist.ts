import { CiqStoryNode } from './';

export type TwistType = 'childList' | 'attributes' | 'event' | 'resize';

export type BaseTwist = {
  twistId: number;
  timeSincePageLoad: number;
  targetNode?: CiqStoryNode;
};

export type TargetTwist = {
  targetNode: CiqStoryNode;
};

export type ChildListTwist = BaseTwist &
  TargetTwist & {
    type: 'childList';
    addedNodes: CiqStoryNode[];
    removedNodes: CiqStoryNode[];
    nextSibling?: CiqStoryNode;
  };

export type AttributesTwist = BaseTwist &
  TargetTwist & {
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

export const createResizeTwist = (twistId: number, width: number, height: number): ResizeTwist => ({
  twistId,
  width,
  height,
  type: 'resize',
  timeSincePageLoad: performance.now(),
});
export const createEventTwist = (
  twistId: number,
  eventType: string,
  targetNode?: CiqStoryNode,
  clientX?: number,
  clientY?: number,
  textValue?: string
): EventTwist => ({
  twistId,
  eventType,
  targetNode,
  clientX,
  clientY,
  textValue,
  type: 'event',
  timeSincePageLoad: performance.now(),
});
export const createAttributesTwist = (
  twistId: number,
  targetNode: CiqStoryNode,
  attributeName: string,
  attributeValue: string | undefined
): AttributesTwist => ({
  twistId,
  attributeName,
  attributeValue,
  targetNode,
  type: 'attributes',
  timeSincePageLoad: performance.now(),
});

export const createChildListTwist = (
  twistId: number,
  targetNode: CiqStoryNode,
  addedNodes: CiqStoryNode[] = [],
  removedNodes: CiqStoryNode[] = [],
  nextSibling?: CiqStoryNode
): ChildListTwist => ({
  twistId,
  addedNodes,
  removedNodes,
  nextSibling,
  targetNode,
  type: 'childList',
  timeSincePageLoad: performance.now(),
});
