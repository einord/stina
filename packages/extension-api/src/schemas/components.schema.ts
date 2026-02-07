/**
 * Component Schema
 *
 * Zod schemas for extension UI components.
 */

import { z } from 'zod'

// =============================================================================
// CSS Properties
// =============================================================================

/**
 * Allowed CSS property names for extension component styling.
 */
export const AllowedCSSPropertySchema = z.enum([
  // Colors
  'color',
  'background-color',
  'background',
  'border-color',
  // Borders
  'border',
  'border-width',
  'border-style',
  'border-radius',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  // Spacing
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'gap',
  'row-gap',
  'column-gap',
  // Typography
  'font-size',
  'font-weight',
  'font-style',
  'text-align',
  'text-decoration',
  'line-height',
  'letter-spacing',
  'white-space',
  'word-break',
  'overflow-wrap',
  // Layout (safe properties)
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'flex',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'flex-wrap',
  'align-self',
  'justify-self',
  'align-items',
  'justify-content',
  // Visual
  'opacity',
  'visibility',
  'overflow',
  'overflow-x',
  'overflow-y',
  'box-shadow',
  'outline',
  'cursor',
  'border-collapse',
  'border-spacing',
])

/**
 * Style object for extension components.
 */
export const ExtensionComponentStyleSchema = z
  .record(AllowedCSSPropertySchema, z.string())
  .describe('Safe CSS styles for the component')

// =============================================================================
// Base Component
// =============================================================================

/**
 * Base component data schema - allows additional properties
 */
export const ExtensionComponentDataSchema: z.ZodType<{
  component: string
  style?: Record<string, string>
  [key: string]: unknown
}> = z.lazy(() =>
  z
    .object({
      component: z.string().describe('Component type name'),
      style: ExtensionComponentStyleSchema.optional(),
    })
    .passthrough()
    .describe('Extension component definition')
)

// =============================================================================
// Action References
// =============================================================================

/**
 * Action call with parameters
 */
export const ExtensionActionCallSchema = z
  .object({
    action: z.string().describe('Name of the registered action'),
    params: z.record(z.unknown()).optional().describe('Parameters to pass'),
  })
  .describe('Action call with parameters')

/**
 * Action reference - can be a simple string or full action call
 */
export const ExtensionActionRefSchema = z
  .union([z.string(), ExtensionActionCallSchema])
  .describe('Action reference')

// =============================================================================
// Iterator & Children
// =============================================================================

/**
 * Iterator for rendering a list of components from data
 */
export const ExtensionComponentIteratorSchema = z
  .object({
    each: z.union([z.string(), z.array(z.unknown())]).describe('Data source to iterate over'),
    as: z.string().describe('Variable name for current item in scope'),
    items: z.array(ExtensionComponentDataSchema).describe('Components to render for each item'),
  })
  .describe('Iterator for rendering lists')

/**
 * Children can be either a static array of components or an iterator
 */
export const ExtensionComponentChildrenSchema = z
  .union([z.array(ExtensionComponentDataSchema), ExtensionComponentIteratorSchema])
  .describe('Child components or iterator')

// =============================================================================
// Data Source
// =============================================================================

/**
 * Data source definition for fetching data via an action
 */
export const ExtensionDataSourceSchema = z
  .object({
    action: z.string().describe('Action to call for fetching data'),
    params: z.record(z.unknown()).optional().describe('Parameters to pass to the action'),
    refreshOn: z.array(z.string()).optional().describe('Event names that trigger a refresh'),
  })
  .describe('Data source definition')

// =============================================================================
// Component Props Schemas
// =============================================================================

export const HeaderPropsSchema = z
  .object({
    component: z.literal('Header'),
    level: z.number().min(1).max(6).describe('Heading level (1-6)'),
    title: z.string().describe('Header title'),
    description: z.union([z.string(), z.array(z.string())]).optional().describe('Description text'),
    icon: z.string().optional().describe('Icon name'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('Header component')

export const LabelPropsSchema = z
  .object({
    component: z.literal('Label'),
    text: z.string().describe('Label text'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('Label component')

export const ParagraphPropsSchema = z
  .object({
    component: z.literal('Paragraph'),
    text: z.string().describe('Paragraph text'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('Paragraph component')

export const ButtonPropsSchema = z
  .object({
    component: z.literal('Button'),
    text: z.string().describe('Button text'),
    onClickAction: ExtensionActionRefSchema.describe('Action to call on click'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('Button component')

export const TextInputPropsSchema = z
  .object({
    component: z.literal('TextInput'),
    label: z.string().describe('Input label'),
    placeholder: z.string().optional().describe('Placeholder text'),
    value: z.string().optional().describe('Current value'),
    onChangeAction: ExtensionActionRefSchema.describe('Action to call on change'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('TextInput component')

export const DateTimeInputPropsSchema = z
  .object({
    component: z.literal('DateTimeInput'),
    label: z.string().describe('Input label'),
    value: z.string().optional().describe('Current value'),
    onChangeAction: ExtensionActionRefSchema.describe('Action to call on change'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('DateTimeInput component')

export const SelectPropsSchema = z
  .object({
    component: z.literal('Select'),
    label: z.string().describe('Select label'),
    options: z.array(z.object({ label: z.string(), value: z.string() })).describe('Available options'),
    selectedValue: z.string().optional().describe('Currently selected value'),
    onChangeAction: ExtensionActionRefSchema.describe('Action to call on change'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('Select component')

export const IconPickerPropsSchema = z
  .object({
    component: z.literal('IconPicker'),
    label: z.string().optional().describe('Picker label'),
    value: z.string().optional().describe('Currently selected icon name'),
    onChangeAction: ExtensionActionRefSchema.describe('Action to call on change'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('IconPicker component')

export const VerticalStackPropsSchema = z
  .object({
    component: z.literal('VerticalStack'),
    gap: z.number().optional().describe('Gap between children'),
    children: ExtensionComponentChildrenSchema.describe('Child components'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('VerticalStack layout component')

export const HorizontalStackPropsSchema = z
  .object({
    component: z.literal('HorizontalStack'),
    gap: z.number().optional().describe('Gap between children'),
    children: ExtensionComponentChildrenSchema.describe('Child components'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('HorizontalStack layout component')

export const GridPropsSchema = z
  .object({
    component: z.literal('Grid'),
    columns: z.number().describe('Number of columns'),
    gap: z.number().optional().describe('Gap between items'),
    children: ExtensionComponentChildrenSchema.describe('Child components'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('Grid layout component')

export const DividerPropsSchema = z
  .object({
    component: z.literal('Divider'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('Divider component')

export const IconPropsSchema = z
  .object({
    component: z.literal('Icon'),
    name: z.string().describe('Icon name'),
    title: z.string().optional().describe('Icon title'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('Icon component')

export const IconButtonTypeSchema = z
  .enum(['normal', 'primary', 'danger', 'accent'])
  .describe('Button type')

export const IconButtonPropsSchema = z
  .object({
    component: z.literal('IconButton'),
    icon: z.string().describe('Icon name'),
    tooltip: z.string().describe('Tooltip text'),
    active: z.boolean().optional().describe('Whether the button is active'),
    disabled: z.boolean().optional().describe('Whether the button is disabled'),
    type: IconButtonTypeSchema.optional().describe('Button style type'),
    onClickAction: ExtensionActionRefSchema.describe('Action to call on click'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('IconButton component')

export const PanelActionSchema = z
  .object({
    icon: z.string().describe('Icon name'),
    tooltip: z.string().describe('Tooltip text'),
    action: ExtensionActionRefSchema.describe('Action to call'),
    type: IconButtonTypeSchema.optional().describe('Button style type'),
  })
  .describe('Panel action button')

export const PanelPropsSchema = z
  .object({
    component: z.literal('Panel'),
    title: z.string().describe('Panel title'),
    description: z.union([z.string(), z.array(z.string())]).optional().describe('Description text'),
    icon: z.string().optional().describe('Icon name'),
    actions: z.array(PanelActionSchema).optional().describe('Action buttons'),
    content: ExtensionComponentDataSchema.optional().describe('Panel content'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('Panel component')

export const TogglePropsSchema = z
  .object({
    component: z.literal('Toggle'),
    label: z.string().optional().describe('Toggle label'),
    description: z.string().optional().describe('Description text'),
    checked: z.boolean().optional().describe('Whether the toggle is checked'),
    disabled: z.boolean().optional().describe('Whether the toggle is disabled'),
    onChangeAction: ExtensionActionRefSchema.describe('Action to call on change'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('Toggle component')

export const CollapsiblePropsSchema = z
  .object({
    component: z.literal('Collapsible'),
    title: z.string().describe('Title displayed in the header'),
    description: z.union([z.string(), z.array(z.string())]).optional().describe('Description text'),
    icon: z.string().optional().describe('Icon name'),
    defaultExpanded: z.boolean().optional().describe('Whether expanded by default'),
    content: ExtensionComponentDataSchema.optional().describe('Content when expanded'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('Collapsible component')

export const PillVariantSchema = z
  .enum(['default', 'primary', 'success', 'warning', 'danger', 'accent'])
  .describe('Pill color variant')

export const PillPropsSchema = z
  .object({
    component: z.literal('Pill'),
    text: z.string().describe('Pill text'),
    icon: z.string().optional().describe('Icon name'),
    variant: PillVariantSchema.optional().describe('Color variant'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('Pill component')

export const CheckboxPropsSchema = z
  .object({
    component: z.literal('Checkbox'),
    label: z.string().describe('Checkbox label'),
    checked: z.boolean().optional().describe('Whether the checkbox is checked'),
    disabled: z.boolean().optional().describe('Whether the checkbox is disabled'),
    strikethrough: z.boolean().optional().describe('Strike through label when checked'),
    onChangeAction: ExtensionActionRefSchema.describe('Action to call on change'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('Checkbox component')

export const MarkdownPropsSchema = z
  .object({
    component: z.literal('Markdown'),
    content: z.string().describe('Markdown content'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('Markdown component')

export const ModalPropsSchema = z
  .object({
    component: z.literal('Modal'),
    title: z.string().describe('Modal title'),
    open: z.boolean().optional().describe('Whether the modal is open'),
    maxWidth: z.string().optional().describe('Max width of the modal'),
    body: ExtensionComponentDataSchema.optional().describe('Modal body content'),
    footer: ExtensionComponentDataSchema.optional().describe('Modal footer content'),
    onCloseAction: ExtensionActionRefSchema.optional().describe('Action to call on close'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('Modal component')

export const ConditionalGroupPropsSchema = z
  .object({
    component: z.literal('ConditionalGroup'),
    condition: z.string().describe('Condition expression to evaluate'),
    children: ExtensionComponentChildrenSchema.describe('Children to render when condition is true'),
    style: ExtensionComponentStyleSchema.optional(),
  })
  .passthrough()
  .describe('ConditionalGroup component')

// =============================================================================
// Type Exports
// =============================================================================

export type AllowedCSSProperty = z.infer<typeof AllowedCSSPropertySchema>
export type ExtensionComponentStyle = z.infer<typeof ExtensionComponentStyleSchema>
export type ExtensionComponentData = z.infer<typeof ExtensionComponentDataSchema>
export type ExtensionActionCall = z.infer<typeof ExtensionActionCallSchema>
export type ExtensionActionRef = z.infer<typeof ExtensionActionRefSchema>
export type ExtensionComponentIterator = z.infer<typeof ExtensionComponentIteratorSchema>
export type ExtensionComponentChildren = z.infer<typeof ExtensionComponentChildrenSchema>
export type ExtensionDataSource = z.infer<typeof ExtensionDataSourceSchema>
export type IconButtonType = z.infer<typeof IconButtonTypeSchema>
export type PillVariant = z.infer<typeof PillVariantSchema>
export type PanelAction = z.infer<typeof PanelActionSchema>
export type HeaderProps = z.infer<typeof HeaderPropsSchema>
export type LabelProps = z.infer<typeof LabelPropsSchema>
export type ParagraphProps = z.infer<typeof ParagraphPropsSchema>
export type ButtonProps = z.infer<typeof ButtonPropsSchema>
export type TextInputProps = z.infer<typeof TextInputPropsSchema>
export type DateTimeInputProps = z.infer<typeof DateTimeInputPropsSchema>
export type SelectProps = z.infer<typeof SelectPropsSchema>
export type IconPickerProps = z.infer<typeof IconPickerPropsSchema>
export type VerticalStackProps = z.infer<typeof VerticalStackPropsSchema>
export type HorizontalStackProps = z.infer<typeof HorizontalStackPropsSchema>
export type GridProps = z.infer<typeof GridPropsSchema>
export type DividerProps = z.infer<typeof DividerPropsSchema>
export type IconProps = z.infer<typeof IconPropsSchema>
export type IconButtonProps = z.infer<typeof IconButtonPropsSchema>
export type PanelProps = z.infer<typeof PanelPropsSchema>
export type ToggleProps = z.infer<typeof TogglePropsSchema>
export type CollapsibleProps = z.infer<typeof CollapsiblePropsSchema>
export type PillProps = z.infer<typeof PillPropsSchema>
export type CheckboxProps = z.infer<typeof CheckboxPropsSchema>
export type MarkdownProps = z.infer<typeof MarkdownPropsSchema>
export type ModalProps = z.infer<typeof ModalPropsSchema>
export type ConditionalGroupProps = z.infer<typeof ConditionalGroupPropsSchema>
