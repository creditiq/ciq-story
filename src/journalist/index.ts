import { CiqStoryTwist, createAttributesTwist, createChildListTwist, createEventTwist, createResizeTwist, EventTwist } from '../types';
import { CiqStoryNode } from '../types';
import { isElement, valueOrUndefined } from '../util';

import * as _ from 'lodash';

const uuid = require('uuid');

export function createJournalist(debugMode?: boolean) {

  let recordedTwists: CiqStoryTwist[];
  const story = {
    id: uuid.v1(),
    timestamp: Date.now(),
    twists: null as CiqStoryTwist[] | null
  };

  // get initial dom state
  recordedTwists = walkAddTree(document.childNodes, document);

  function makeCiqStoryNode(node: Node) {
    return new CiqStoryNode(node);
  }

  function absolutePath(href: string) {
    const link = document.createElement('a');
    link.href = href;
    return (link.protocol + '//' + link.host + link.pathname + link.search + link.hash);
  }

  function makeAddTwist(addedNodes: Node[], target: Node) {
    return createChildListTwist(
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
        }
        return storyNode;
      })
    );
  }

  function filterAddedNodelist(addedNodeList: NodeList): Node[] {
    return Array.prototype.slice.call(addedNodeList).filter(() => true);
  }

  function walkAddTree(addedNodeList: NodeList, target: Node): CiqStoryTwist[] {
    const addedNodes = filterAddedNodelist(addedNodeList);
    const twist = makeAddTwist(addedNodes, target);
    const results = _.flatten(addedNodes.map((addedNode) => {
      if (addedNode.childNodes.length) {
        return walkAddTree(addedNode.childNodes, addedNode);
      }
      return [];
    }));
    results.unshift(twist);
    return results;
  }

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
              accum = [...accum, ...walkAddTree(mutation.addedNodes, mutation.target)];
            }
            if (mutation.removedNodes.length) {
              const twist = createChildListTwist(
                new CiqStoryNode(mutation.target),
                undefined,
                Array.prototype.slice.call(mutation.removedNodes).map(makeCiqStoryNode),
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

  function makeAndAddResizeTwist() {
    const resizeTwist = createResizeTwist(
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
          twist = createEventTwist(e.type, targetNode);
          if (e instanceof MouseEvent) {
            twist.clientX = e.clientX;
            twist.clientY = e.clientY;
          }
          break;
        case 'input':
          if (target instanceof Node) {
            targetNode = new CiqStoryNode(target);
          }
          twist = createEventTwist(e.type, targetNode);
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

  setInterval(() => {
    // call inside anonymous to allow debuggin overrides
    ciqStoryJournalist.sendTwists(recordedTwists);
  }, 5000);

  const ciqStoryJournalist = {
    // you can just override this method if you want to log them or something instead
    lastTwistsLength: 0,
    sendTwists(twists: CiqStoryTwist[]) {
      if (!twists.length || twists.length === ciqStoryJournalist.lastTwistsLength) {
        return;
      }
      ciqStoryJournalist.lastTwistsLength = twists.length;
      story.twists = twists;
      const oReq = new XMLHttpRequest();
      oReq.onreadystatechange = () => {
        let status;
        if (oReq.readyState === 4) { // `DONE`
          status = oReq.status;
          if (status === 200) {
            console.log(oReq.response);
          } else {
            console.log('error');
          }
        }
      };
      oReq.open('POST', 'https://4kz2iij01i.execute-api.us-east-1.amazonaws.com/production/story');
      oReq.setRequestHeader('Accept', 'application/json');
      oReq.send(JSON.stringify(story));
    },
    popRecordedTwists() {
      const twists = recordedTwists;
      recordedTwists = [];
      return twists;
    }
  };
  return ciqStoryJournalist;
}
