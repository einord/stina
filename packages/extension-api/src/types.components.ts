/** Base interface for dynamically rendered extension components. */
export interface ExtensionComponentData {
  component: string
  [key: string]: unknown
}

/** The extension API properties for the Header component. */
export interface HeaderProps extends ExtensionComponentData {
  component: 'Header'
  level: number
  title?: string
}
