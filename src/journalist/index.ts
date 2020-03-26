import { CiqStoryTwist, createAttributesTwist, createChildListTwist, createEventTwist, createResizeTwist, EventTwist } from '../types';
import { CiqStoryNode } from '../types';
import { isElement, valueOrUndefined } from '../util';

import * as _ from 'lodash';
import { IntId } from '../int-id';

const uuid = require('uuid');

function walkAddTree(
  addedNodeList: NodeList,
  target: Node,
  twistIdFactory: Pick<IntId, 'next'>,
  nextSibling?: CiqStoryNode,
  nodeCB?: <T>(node: Node) => T | void,
) {
  return walkAddNodeTree(filterAddedNodelist(addedNodeList), target, twistIdFactory, nextSibling, nodeCB);
}

export function walkAddNodeTree(
  addedNodes: Node[],
  target: Node,
  twistIdFactory: Pick<IntId, 'next'>,
  nextSibling?: CiqStoryNode,
  nodeCB?: <T>(node: Node) => T | void,
): CiqStoryTwist[] {
  if (addedNodes.length === 0) {
    return [];
  }
  // top one gets the siblings, for the rest it doesn't strictly matter
  const twist = makeAddTwist(addedNodes, target, twistIdFactory.next(), nextSibling);
  const results = _.flatten(addedNodes.map((addedNode) => {
    if (nodeCB) {
      nodeCB(addedNode);
    }
    if (addedNode.childNodes.length) {
      const addTwists = walkAddTree(addedNode.childNodes, addedNode, twistIdFactory, undefined, nodeCB);
      return addTwists;
    }
    return [];
  }));
  results.unshift(twist);
  return results;
}

function makeCiqStoryNode(node: Node) {
  return new CiqStoryNode(node);
}

function absolutePath(href: string) {
  const link = document.createElement('a');
  link.href = href;
  return (link.protocol + '//' + link.host + link.pathname + link.search + link.hash);
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
    nextSibling,
  );
}

function filterAddedNodelist(addedNodeList: NodeList): Node[] {
  return Array.prototype.slice.call(addedNodeList).filter(() => true);
}

type StyleNodeWatch = { node: HTMLStyleElement, previousTextNode?: Node };

export function createJournalist(
  sendBatch: (twistBatch: { storyId: string, batchId: number, twists: CiqStoryTwist[], isBeforeUnload?: boolean }) => any,
  opts: { debugMode?: boolean, batchIntervalMs?: number, noBatchInterval?: boolean } = {}
) {

  let recordedTwists: CiqStoryTwist[] = [];
  const twistIdFactory = new IntId();
  const batchId = new IntId();
  const story = {
    id: uuid.v4(),
    timestamp: Date.now(),
  };
  const styleNodesToText: Record<string, StyleNodeWatch> = {}; // nodeId to cssText

  function walkAddTreeGetStylePromises(
    addedNodeList: NodeList,
    target: Node,
    _twistIdFactory: Pick<IntId, 'next'>,
    nextSibling?: CiqStoryNode,
  ) {
    const styleTwists: Array<Promise<CiqStoryTwist[]>> = [];
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
      return styleNodesToText[new CiqStoryNode(addedNode).nodeId] = { node: addedNode, previousTextNode: undefined };
    }
    return undefined;
  }

  function captureInitialDOMState() {
    const addTwists = walkAddTreeGetStylePromises(document.childNodes, document, twistIdFactory);
    // get initial dom state
    recordedTwists = addTwists;
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
    const newTwists = _.compact(_.flatten(Object.values(styleNodesToText).map(({ node, previousTextNode }) => {
      const ruleText = getRuleTextFromNode(node);
      if (ruleText && ruleText !== previousTextNode?.textContent) {
        const newTextNode = document.createTextNode(ruleText);
        styleNodesToText[CiqStoryNode.idFactory.getStoryNodeId(node)] = {
          node,
          previousTextNode: newTextNode
        };

        const removal = previousTextNode && createRemoveTwist([previousTextNode], node, twistIdFactory.next());
        const addition = makeAddTwist([newTextNode], node, twistIdFactory.next());
        return _.compact([removal, addition]);
      }
      return undefined;
    })));
    if (newTwists.length > 0) {
      recordedTwists = recordedTwists.concat(newTwists);
    }
  }, 100);

  const journalistObserver = new MutationObserver((mutations: MutationRecord[]) => {
    const twists: CiqStoryTwist[] = mutations.reduce(
      (accum: CiqStoryTwist[], mutation: MutationRecord) => {
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
              accum = [
                ...accum,
                ...addTwists
              ];
            }
            if (mutation.removedNodes.length) {
              const twist = createRemoveTwist(
                Array.prototype.slice.call(mutation.removedNodes),
                mutation.target,
                twistIdFactory.next(),
                mutation.nextSibling || undefined,
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
            const twist = createAttributesTwist(
              twistIdFactory.next(),
              new CiqStoryNode(mutation.target),
              attributeName,
              attributeValue,
            );
            twist.attributeName = attributeName;
            twist.attributeValue = valueOrUndefined(mutation.target.getAttribute(attributeName));
            accum.push(twist);
            break;
          }
        }

        return accum;
      }, []);
    recordedTwists = recordedTwists.concat(twists);
  });

  journalistObserver.observe(document,
    { childList: true, subtree: true, attributes: true }
  );

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
    const resizeTwist = createResizeTwist(
      twistIdFactory.next(),
      window.innerWidth,
      window.innerHeight,
    );
    recordedTwists.push(resizeTwist);
  }

  window.addEventListener('resize', (e) => {
    makeAndAddResizeTwist();
  });
  makeAndAddResizeTwist(); // one to intialize

  const events = ['mousemove', 'mousedown', 'mouseup', 'input'];

  events.forEach((eventType) => {
    document.addEventListener(eventType, (e) => {
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
        recordedTwists.push(twist);
      }
    }, true);
  });

  const getAndSendBatch = (isBeforeUnload?: boolean, ) => {
    const twists = ciqStoryJournalist.popRecordedTwists();
    if (!twists || twists.length === 0) {
      return;
    }
    return sendBatch({
      storyId: story.id,
      batchId: batchId.next(),
      twists,
      isBeforeUnload,
    });
  };

  if (!opts.noBatchInterval) {
    setInterval(() => {
      // call inside anonymous to allow debugging overrides
      getAndSendBatch();
    }, opts.batchIntervalMs || 5000);
  }

  window.addEventListener('beforeunload', () => getAndSendBatch(true));

  const ciqStoryJournalist = {
    story,
    popRecordedTwists() {
      const twists = recordedTwists;
      recordedTwists = [];
      return twists;
    }
  };
  return ciqStoryJournalist;
}