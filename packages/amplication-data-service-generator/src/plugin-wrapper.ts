import { EventNames, Module, EventParams } from "@amplication/code-gen-types";
import DsgContext from "./dsg-context";

export type PluginWrapper = (
  func: (...args: any) => Module[] | Promise<Module[]>,
  event: EventNames,
  ...args: any
) => any;

const beforeEventsPipe = (
  ...fns: ((context: DsgContext, eventParams: EventParams) => EventParams)[]
) => (context: DsgContext, eventParams: EventParams) =>
  fns.reduce((res, fn) => {
    return fn(context, res);
  }, eventParams);

const afterEventsPipe = (
  ...fns: ((dsgContext: DsgContext, modules: Module[]) => Module)[]
) => (context: DsgContext, modules: Module[]) =>
  fns.reduce((res, fn) => {
    return fn(context, res);
  }, modules);

const defaultBehavior = async (
  context: DsgContext,
  func: (...args: any) => any,
  beforeFuncResults: any
) => {
  if (context.utils.skipDefaultBehavior) return [];

  return Object.prototype.toString.call(func) === "[object AsyncFunction]"
    ? await func(beforeFuncResults)
    : func(beforeFuncResults);
};

/**
 * This function can wrap all dsg function in order to assign before and after plugin logic
 * @param args => original DSG arguments
 * @param func => DSG function
 * @param event => event name to find the specific plugin
 */
const pluginWrapper: PluginWrapper = async (
  func,
  event,
  args
): Promise<Module[]> => {
  const context = DsgContext.getInstance;

  try {
    context.utils.skipDefaultBehavior = false;
    if (!context.plugins.hasOwnProperty(event)) return func(args);

    const beforePlugins = context.plugins[event]?.before || [];
    const afterPlugins = context.plugins[event]?.after || [];

    const updatedEventParams = beforePlugins
      ? beforeEventsPipe(...beforePlugins)(context, args)
      : args;
    const defaultBehaviorModules = await defaultBehavior(
      context,
      func,
      updatedEventParams
    );

    const finalModules = afterPlugins
      ? await afterEventsPipe(...afterPlugins)(
          context,
          args,
          defaultBehaviorModules
        )
      : defaultBehaviorModules;

    context.modules.push(finalModules);
    return finalModules;
  } catch (error) {
    context.logger.error(`failed to execute plugin event ${event}`, {
      errorMessage: JSON.stringify(error),
    });
    return [];
  }
};

export default pluginWrapper;
