import type { Item, ItemComponent, RemovedItemComponent } from '../../index'

declare const item: Item

const food: ItemComponent<{ nutrition: number }> = {
  type: 'villager_food',
  data: { nutrition: 4 }
}

item.components?.push(food)
item.componentMap?.set(food.type, food)

const removed: RemovedItemComponent = { type: 'map_color' }
item.removedComponents?.push(removed)

const stored = item.componentMap?.get('villager_food')
if (stored) {
  const data: unknown = stored.data
  // @ts-expect-error Generic component payloads must be narrowed before use.
  const unsafeString: string = stored.data
  void data
  void unsafeString
}
