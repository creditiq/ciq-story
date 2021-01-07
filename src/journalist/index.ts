import lifecycle = require('page-lifecycle/dist/lifecycle.es5.js');
import * as _ from 'lodash';
import * as uuid from 'uuid';

import { IntId } from '../int-id';
import { CiqStoryTwist, createAttributesTwist, createChildListTwist, createEventTwist, createResizeTwist, EventTwist } from '../types';
import { CiqStoryNode } from '../types';
import { isElement, valueOrUndefined } from '../util';
export const CIQ_STORY_OBSCURED_CLASS = 'ciq-obscured';

function walkAddTree(
  addedNodeList: NodeList,
  target: Node,
  twistIdFactory: Pick<IntId, 'next'>,
  nextSibling?: CiqStoryNode,
  nodeCB?: <T>(node: Node) => T | void
) {
  return walkAddNodeTree(filterAddedNodelist(addedNodeList), target, twistIdFactory, nextSibling, nodeCB);
}

export function walkAddNodeTree(
  addedNodes: Node[],
  target: Node,
  twistIdFactory: Pick<IntId, 'next'>,
  nextSibling?: CiqStoryNode,
  nodeCB?: <T>(node: Node) => T | void
): CiqStoryTwist[] {
  if (addedNodes.length === 0) {
    return [];
  }
  // top one gets the siblings, for the rest it doesn't strictly matter
  const twist = makeAddTwist(addedNodes, target, twistIdFactory.next(), nextSibling);
  const results = _.flatten(
    addedNodes.map((addedNode) => {
      if (nodeCB) {
        nodeCB(addedNode);
      }
      if (addedNode.childNodes.length) {
        const addTwists = walkAddTree(addedNode.childNodes, addedNode, twistIdFactory, undefined, nodeCB);
        return addTwists;
      }
      return [];
    })
  );
  results.unshift(twist);
  return results;
}

function makeCiqStoryNode(node: Node) {
  return new CiqStoryNode(node);
}

function absolutePath(href: string) {
  const link = document.createElement('a');
  link.href = href;
  return link.protocol + '//' + link.host + link.pathname + link.search + link.hash;
}

function makeAddTwist(addedNodes: Node[], target: Node, twistId: number, nextSibling?: CiqStoryNode) {
  return createChildListTwist(
    twistId,
    new CiqStoryNode(target),
    addedNodes.map((addedNode) => {
      const storyNode = makeCiqStoryNode(addedNode);
      if (storyNode.tagName === 'LINK') {
        if (storyNode.attributes && storyNode.attributes.href) {
          const path = absolutePath(storyNode.attributes.href);
          storyNode.attributes.href = path;
        }
      } else if (storyNode.tagName === 'SCRIPT') {
        storyNode.tagName = 'POOP-SCRIPT'; // don't let these execute
        const attributes = storyNode.attributes || {};
        attributes.style = `${attributes.style}; display: none;`;
        storyNode.attributes = attributes;
      }
      return storyNode;
    }),
    undefined,
    nextSibling
  );
}

function filterAddedNodelist(addedNodeList: NodeList): Node[] {
  return Array.prototype.slice.call(addedNodeList).filter(() => true);
}

type StyleNodeWatch = { node: HTMLStyleElement; previousTextNode?: Node };

export enum BatchSizeUnit {
  MEGABYTES = 'MEGABYTES',
  KILOBYTES = 'KILOBYTES',
  BYTES = 'BYTES',
}

export enum BatchTimeUnit {
  SECONDS = 'SECONDS',
  MILLISECONDS = 'MILLISECONDS',
}
export type BatchSize = {
  value: number;
  unit: BatchSizeUnit;
};

export type BatchTime = {
  value: number;
  unit: BatchTimeUnit;
};

export type Batch = {
  storyId: string;
  batchId: number;
  twists: CiqStoryTwist[];
  isBeforeUnload?: boolean;
};

export type BatchingOptions = {
  /*  defaults to 63kb (because 64 this is the limit for a keepalive fetch,
     gives a little space for meta) and plain numbers are presumed to be BYTES */
  batchSize?: BatchSize | number | false;
  /* defaults to 5 seconds, and plain numbers are presumed to be MILLISECONDS */
  batchTime?: BatchTime | number | false;
  sendBatch: (twistBatch: Batch) => any;
};

type Batching = {
  batchTime: BatchTime | false;
  batchSize: BatchSize | false;
} & Pick<BatchingOptions, 'sendBatch'>;

type JournalistOptions = {
  debugMode?: boolean;
  batching?: BatchingOptions;
  // if you want to do some other method of recording
  onRecordTwist?: (addedTwists: CiqStoryTwist) => any;
};

function defaultBatchSetting<T extends BatchTime | BatchSize>(
  batchSetting: number | false | T | undefined,
  fullDefault: T,
  unitDefault: T['unit']
) {
  return batchSetting === false
    ? batchSetting
    : !batchSetting
    ? fullDefault
    : typeof batchSetting === 'number'
    ? {
        unit: unitDefault,
        value: batchSetting,
      }
    : batchSetting;
}

function setupBatching(batching: BatchingOptions | undefined): Batching | undefined {
  if (!batching) {
    return undefined;
  }
  const batchTime = defaultBatchSetting(
    batching.batchTime,
    {
      unit: BatchTimeUnit.SECONDS,
      value: 5,
    },
    BatchTimeUnit.MILLISECONDS
  );
  const batchSize = defaultBatchSetting(
    batching.batchSize,
    {
      unit: BatchSizeUnit.KILOBYTES,
      value: 64,
    },
    BatchSizeUnit.BYTES
  );
  return {
    ...batching,
    batchSize,
    batchTime,
  };
}

export function createJournalist(opts: JournalistOptions = {}) {
  const batching = setupBatching(opts.batching);
  const maxBytes = getMaxBytes();
  let recordedTwists: CiqStoryTwist[] = [];
  let currentBatchSize = 0;
  const twistIdFactory = new IntId();
  const batchId = new IntId();
  const story = {
    id: uuid.v4(),
    timestamp: Date.now(),
  };
  const styleNodesToText: Record<string, StyleNodeWatch> = {}; // nodeId to cssText
  const obscuredNodes: Record<string, true | undefined> = {};
  const ciqStoryJournalist = {
    story,
    popRecordedTwists() {
      const twists = recordedTwists;
      recordedTwists = [];
      currentBatchSize = 0;
      return twists;
    },
  };

  function getMaxBytes() {
    if (batching && batching.batchSize) {
      const { unit, value: size } = batching.batchSize;
      return (
        size *
        (unit === BatchSizeUnit.KILOBYTES ? 1024 : unit === BatchSizeUnit.MEGABYTES ? 1024 * 1024 : 1) // last case is BYTES
      );
    }
    return undefined;
  }

  function walkAddTreeGetStylePromises(
    addedNodeList: NodeList,
    target: Node,
    _twistIdFactory: Pick<IntId, 'next'>,
    nextSibling?: CiqStoryNode
  ) {
    const addTwists = walkAddTree(addedNodeList, target, _twistIdFactory, nextSibling, (node) => {
      processStyleTags(node);
    });
    return addTwists;
  }

  function isStyle(node: Node): node is HTMLStyleElement {
    const nodeName = node.nodeName.toUpperCase();
    return nodeName === 'STYLE';
  }

  function isCssStyle(sheet: StyleSheet): sheet is CSSStyleSheet {
    return (sheet as any).cssRules != null;
  }

  function getRuleTextFromNode(addedNode: HTMLStyleElement) {
    try {
      if (addedNode.sheet && isCssStyle(addedNode.sheet)) {
        const rulesArray: CSSRule[] = Array.prototype.slice.call(addedNode.sheet.cssRules);
        if (rulesArray.length === 0) {
          console.log('No Rules for sheet on: ', addedNode);
        }
        const ruleTexts = rulesArray.map((rule) => rule.cssText);
        return ruleTexts.join('\n');
      }
    } catch (e) {
      // nothing
    }
    return undefined;
  }

  function processStyleTags(addedNode: Node): StyleNodeWatch | undefined {
    if (isStyle(addedNode) && !addedNode.textContent?.trim()) {
      return (styleNodesToText[new CiqStoryNode(addedNode).nodeId] = { node: addedNode, previousTextNode: undefined });
    }
    return undefined;
  }

  function classHasCiqObscured(classAttribute: string | undefined) {
    return classAttribute?.includes(CIQ_STORY_OBSCURED_CLASS);
  }

  function isCiqNodeObscured(storyNode: CiqStoryNode) {
    return !!obscuredNodes[storyNode.nodeId];
  }

  function obscureValue(value: string): string;
  function obscureValue(value: string | undefined): string | undefined;
  function obscureValue(value: string | undefined) {
    return value?.replace(/./g, '*');
  }

  function beEvilAndMutateNodeValueIfObscured(node: CiqStoryNode, targetNode: CiqStoryNode) {
    if (!isCiqNodeObscured(targetNode)) {
      return;
    }
    if (node.nodeType === 3) {
      node.nodeValue = obscureValue(node.nodeValue);
    }
    if (node.attributes?.value) {
      node.attributes.value = obscureValue(node.attributes.value);
    }
  }

  function processRecordedTwist(twist: CiqStoryTwist) {
    switch (twist.type) {
      case 'childList': {
        twist.addedNodes.map((node) => {
          if (classHasCiqObscured(node.attributes?.class)) {
            obscuredNodes[node.nodeId] = true;
          }
          beEvilAndMutateNodeValueIfObscured(node, twist.targetNode);
        });
        twist.removedNodes.forEach((node) => {
          // do this first. if it's obscured we want to still obscure any attribute before unobscuring it
          beEvilAndMutateNodeValueIfObscured(node, twist.targetNode);

          if (isCiqNodeObscured(node)) {
            obscuredNodes[node.nodeId] = undefined;
          }
        });
        break;
      }
      case 'attributes': {
        if (twist.attributeName === 'class') {
          if (classHasCiqObscured(twist.attributeValue)) {
            obscuredNodes[twist.targetNode.nodeId] = true;
          } else if (isCiqNodeObscured(twist.targetNode)) {
            obscuredNodes[twist.targetNode.nodeId] = undefined;
          }
        }
        if (isCiqNodeObscured(twist.targetNode) && twist.attributeName === 'value') {
          twist.attributeValue = obscureValue(twist.attributeValue);
        }
        break;
      }
      case 'event': {
        // for eventType 'input' but make it more robust in case we ever have other text events
        if (twist.targetNode && twist.textValue) {
          if (isCiqNodeObscured(twist.targetNode)) {
            twist.textValue = obscureValue(twist.textValue);
          }
        }
      }
    }
    return twist;
  }

  function calcSizeAndAddToTotal(twist: CiqStoryTwist) {
    const size = JSON.stringify(twist).length * 2;
    currentBatchSize += size;
  }

  const getAndSendBatch = (isBeforeUnload?: boolean) => {
    const twists = ciqStoryJournalist.popRecordedTwists();
    if (!twists || twists.length === 0 || !batching) {
      return;
    }
    /*
      kick the batch interval off in case we got here by reaching a size limit
    */
    resetBatchInterval(batching);
    return batching.sendBatch({
      storyId: story.id,
      batchId: batchId.next(),
      twists,
      isBeforeUnload,
    });
  };

  let batchIntervalId: number | undefined;
  function resetBatchInterval(_batching: Batching) {
    if (batchIntervalId) {
      clearInterval(batchIntervalId);
    }
    if (_batching.batchTime !== false) {
      const batchTimeInMillis = _batching.batchTime.value * (_batching.batchTime.unit === BatchTimeUnit.SECONDS ? 1000 : 1);
      batchIntervalId = window.setInterval(() => {
        // call inside anonymous to allow debugging overrides
        getAndSendBatch();
      }, batchTimeInMillis);
    }
  }

  if (batching) {
    resetBatchInterval(batching);
    lifecycle.addEventListener('statechange', (event) => {
      if (event.newState === 'hidden') {
        getAndSendBatch(true);
      }
    });
  }

  function recordTwist(twist: CiqStoryTwist) {
    const processedTwist = processRecordedTwist(twist);
    recordedTwists.push(processedTwist);
    if (maxBytes != null) {
      calcSizeAndAddToTotal(processedTwist);
      if (currentBatchSize > maxBytes) {
        getAndSendBatch();
      }
    }
    if (opts.onRecordTwist) {
      opts.onRecordTwist(processedTwist);
    }
    return processedTwist;
  }

  function recordTwists(twists: CiqStoryTwist[] | CiqStoryTwist) {
    if (Array.isArray(twists)) {
      twists.forEach(recordTwist);
    } else {
      recordTwist(twists);
    }

    /*
     batch size can be larger, but if the current batch size is nearly 64kb we can't let it sit around or
     our version of page unload won't be accepted,
     getAndSendBatch also only works if batching is enabled and is idempotent if it's already been called for this set of twists
    */

    if (currentBatchSize > 63 * 1024) {
      getAndSendBatch();
    }
  }

  function captureInitialDOMState() {
    const addTwists = walkAddTreeGetStylePromises(document.childNodes, document, twistIdFactory);
    // get initial dom state
    recordTwists(addTwists);
  }
  captureInitialDOMState();

  function getHighestParent(elem: Node) {
    let parent = elem.parentNode;
    while (parent) {
      elem = parent;
      parent = elem.parentNode;
    }
    return elem;
  }

  function isInDom(elem: Node) {
    return getHighestParent(elem) === document;
  }

  setInterval(() => {
    const newTwists = _.compact(
      _.flatten(
        Object.values(styleNodesToText).map(({ node, previousTextNode }) => {
          const ruleText = getRuleTextFromNode(node);
          if (ruleText && ruleText !== previousTextNode?.textContent) {
            const newTextNode = document.createTextNode(ruleText);
            styleNodesToText[CiqStoryNode.idFactory.getStoryNodeId(node)] = {
              node,
              previousTextNode: newTextNode,
            };

            const removal = previousTextNode && createRemoveTwist([previousTextNode], node, twistIdFactory.next());
            const addition = makeAddTwist([newTextNode], node, twistIdFactory.next());
            return _.compact([removal, addition]);
          }
          return undefined;
        })
      )
    );
    if (newTwists.length > 0) {
      recordTwists(newTwists);
    }
  }, 100);

  const journalistObserver = new MutationObserver((mutations: MutationRecord[]) => {
    const twists: CiqStoryTwist[] = mutations.reduce((accum: CiqStoryTwist[], mutation: MutationRecord) => {
      // for whatever reason we can sometimes get mutations for things that are not in the dom
      if (!isInDom(mutation.target)) {
        return accum;
      }
      switch (mutation.type) {
        case 'childList':
          if (mutation.addedNodes.length) {
            const addTwists = walkAddTreeGetStylePromises(
              mutation.addedNodes,
              mutation.target,
              twistIdFactory,
              mutation.nextSibling ? makeCiqStoryNode(mutation.nextSibling) : undefined
            );
            accum = [...accum, ...addTwists];
          }
          if (mutation.removedNodes.length) {
            const twist = createRemoveTwist(
              Array.prototype.slice.call(mutation.removedNodes),
              mutation.target,
              twistIdFactory.next(),
              mutation.nextSibling || undefined
            );
            accum.push(twist);
          }

          break;
        case 'attributes': {
          const attributeName = valueOrUndefined(mutation.attributeName);
          if (!attributeName || !isElement(mutation.target)) {
            console.error('got an attributes mutation with no attribute or target');
            return accum;
          }
          const attributeValue = valueOrUndefined(mutation.target.getAttribute(attributeName));
          const twist = createAttributesTwist(twistIdFactory.next(), new CiqStoryNode(mutation.target), attributeName, attributeValue);
          twist.attributeName = attributeName;
          twist.attributeValue = valueOrUndefined(mutation.target.getAttribute(attributeName));
          accum.push(twist);
          break;
        }
      }

      return accum;
    }, []);
    recordTwists(twists);
  });

  journalistObserver.observe(document, { childList: true, subtree: true, attributes: true });

  function createRemoveTwist(removedNodes: Node[], target: Node, twistId: number, nextSibling?: Node) {
    return createChildListTwist(
      twistId,
      new CiqStoryNode(target),
      undefined,
      removedNodes.map(makeCiqStoryNode),
      nextSibling ? makeCiqStoryNode(nextSibling) : undefined
    );
  }

  function makeAndAddResizeTwist() {
    const resizeTwist = createResizeTwist(twistIdFactory.next(), window.innerWidth, window.innerHeight);
    recordTwists(resizeTwist);
  }

  window.addEventListener('resize', (e) => {
    makeAndAddResizeTwist();
  });
  makeAndAddResizeTwist(); // one to intialize

  const events = ['mousemove', 'mousedown', 'mouseup', 'input'];

  events.forEach((eventType) => {
    document.addEventListener(
      eventType,
      (e) => {
        let targetNode;
        let twist: EventTwist | undefined;
        const target = e.target;
        switch (e.type) {
          case 'mouseup':
          case 'mousedown':
            if (target instanceof Node) {
              targetNode = new CiqStoryNode(target);
            }
          // tslint:disable-next-line:no-switch-case-fall-through
          case 'mousemove':
            twist = createEventTwist(twistIdFactory.next(), e.type, targetNode);
            if (e instanceof MouseEvent) {
              twist.clientX = e.clientX;
              twist.clientY = e.clientY;
            }
            break;
          case 'input':
            if (target instanceof Node) {
              targetNode = new CiqStoryNode(target);
            }
            twist = createEventTwist(twistIdFactory.next(), e.type, targetNode);
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
              twist.textValue = target.value;
            }
            break;
        }
        if (twist) {
          recordTwists(twist);
        }
      },
      true
    );
  });

  return ciqStoryJournalist;
}
