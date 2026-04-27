/**
 * Local prop types for extension component wrappers.
 *
 * Vue's SFC compiler cannot resolve `extends` against types imported
 * from external npm packages (e.g. @stina/extension-api), so the
 * wrappers can't write `interface Props extends TextInputProps {...}`.
 * Mirroring the prop shapes here keeps the wrappers' types both
 * accurate and SFC-compiler-friendly.
 *
 * If a field is added to the public *Props type in extension-api,
 * mirror it here too.
 */

import type { ExtensionActionRef } from '@stina/extension-api'

type Style = Record<string, string>

/** Common to wrappers backed by host-managed two-way bindings. */
interface BaseInputProps {
  /** Set by resolveComponentProps when value/selectedValue/checked is a $-ref. */
  __bindingPath?: string
  style?: Style
}

export interface TextInputComponentProps extends BaseInputProps {
  component?: 'TextInput'
  label: string
  placeholder?: string
  value?: string
  onChangeAction?: ExtensionActionRef
}

export interface TextAreaComponentProps extends BaseInputProps {
  component?: 'TextArea'
  label: string
  placeholder?: string
  value?: string
  rows?: number
  onChangeAction?: ExtensionActionRef
}

export interface PasswordInputComponentProps extends BaseInputProps {
  component?: 'PasswordInput'
  label: string
  placeholder?: string
  value?: string
  onChangeAction?: ExtensionActionRef
}

export interface NumberInputComponentProps extends BaseInputProps {
  component?: 'NumberInput'
  label: string
  placeholder?: string
  value?: string | number
  min?: number
  max?: number
  step?: number
  onChangeAction?: ExtensionActionRef
}

export interface SelectComponentProps extends BaseInputProps {
  component?: 'Select'
  label: string
  options: Array<{ label: string; value: string }>
  selectedValue?: string
  onChangeAction?: ExtensionActionRef
}

export interface ToggleComponentProps extends BaseInputProps {
  component?: 'Toggle'
  label: string
  description?: string
  checked?: boolean
  disabled?: boolean
  onChangeAction?: ExtensionActionRef
}

export interface CheckboxComponentProps extends BaseInputProps {
  component?: 'Checkbox'
  label: string
  checked?: boolean
  strikethrough?: boolean
  disabled?: boolean
  onChangeAction?: ExtensionActionRef
}
