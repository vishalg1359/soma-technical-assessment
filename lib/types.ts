import { Todo } from '@prisma/client';

/** A task as the API returns it: edges flattened to plain ids for the client. */
export interface TodoWithDependencies extends Todo {
  dependencyIds: number[];
}
