declare module 'page-lifecycle/dist/lifecycle.es5.js' {
  namespace Lifecycle {
    export type LifeCycleEvent = {
      /*  The current lifecycle state the page just transitioned to. */
      newState: string;

      /*  The previous lifecycle state the page just transitioned from. */
      oldState: string;

      /*  the DOM event that triggered the state change. */
      originalEvent: Event;
    };
    export function addEventListener(type: string, listener: (event: LifeCycleEvent) => void): void;
  }

  export = Lifecycle;
}
