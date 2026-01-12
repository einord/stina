/** Base interface for dynamically rendered extension components. */
export interface ExtensionComponentData {
  component: string
  [key: string]: unknown
}

/** The extension API properties for the Header component. */
export interface HeaderProps extends ExtensionComponentData {
  component: 'Header'
  level: number
  title: string
  description?: string | string[]
  icon?: string
}

/** The extension API properties for the Label component. */
export interface LabelProps extends ExtensionComponentData {
  component: 'Label'
  text: string
}

/** The extension API properties for the paragraph component. */
export interface ParagraphProps extends ExtensionComponentData {
  component: 'Paragraph'
  text: string
}

/** The extension API properties for the Button component. */
export interface ButtonProps extends ExtensionComponentData {
  component: 'Button'
  text: string
  onClickAction: string
}

/** The extension API properties for the TextInput component. */
export interface TextInputProps extends ExtensionComponentData {
  component: 'TextInput'
  label: string
  placeholder?: string
  value?: string
  onChangeAction: string
}

/** The extension API properties for the Select component. */
export interface SelectProps extends ExtensionComponentData {
  component: 'Select'
  label: string
  options: Array<{ label: string; value: string }>
  selectedValue?: string
  onChangeAction: string
}

/** The extension API properties for the VerticalStack component. */
export interface VerticalStackProps extends ExtensionComponentData {
  component: 'VerticalStack'
  gap?: number
  children: ExtensionComponentData[]
}

/** The extension API properties for the HorizontalStack component. */
export interface HorizontalStackProps extends ExtensionComponentData {
  component: 'HorizontalStack'
  gap?: number
  children: ExtensionComponentData[]
}

/** The extension API properties for the Grid component. */
export interface GridProps extends ExtensionComponentData {
  component: 'Grid'
  columns: number
  gap?: number
  children: ExtensionComponentData[]
}

/** The extension API properties for the Divider component. */
export interface DividerProps extends ExtensionComponentData {
  component: 'Divider'
}

/** The extension API properties for the Icon component. */
export interface IconProps extends ExtensionComponentData {
  component: 'Icon'
  name: string
  title?: string
}

/** Button type for IconButton. */
export type IconButtonType = 'normal' | 'primary' | 'danger' | 'accent'

/** The extension API properties for the IconButton component. */
export interface IconButtonProps extends ExtensionComponentData {
  component: 'IconButton'
  icon: string
  tooltip: string
  active?: boolean
  disabled?: boolean
  type?: IconButtonType
  onClickAction: string
}

/** Action button definition for Panel component. */
export interface PanelAction {
  icon: string
  tooltip: string
  action: string
  type?: IconButtonType
}

/** The extension API properties for the Panel component. */
export interface PanelProps extends ExtensionComponentData {
  component: 'Panel'
  title: string
  description?: string | string[]
  icon?: string
  actions?: PanelAction[]
  content?: ExtensionComponentData
}

/** The extension API properties for the Toggle component. */
export interface ToggleProps extends ExtensionComponentData {
  component: 'Toggle'
  label?: string
  description?: string
  checked?: boolean
  disabled?: boolean
  onChangeAction: string
}
