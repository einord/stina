import { inject } from 'vue'
import type { InjectionKey } from 'vue'
import type { PanelGroupedListState } from './panelGroupedListState.js'

export const panelGroupedListKey: InjectionKey<PanelGroupedListState> = Symbol('panelGroupedList')

export function usePanelGroupedListContext(): PanelGroupedListState {
  const context = inject(panelGroupedListKey)
  if (!context) {
    throw new Error('PanelGroupedList context not provided')
  }
  return context
}
