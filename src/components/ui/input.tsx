import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const inputVariants = cva(
  'flex h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default: '',
      },
      size: {
        default: 'h-10',
        sm: 'h-8 text-xs',
        lg: 'h-12 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

const Input = React.forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<'input'> & VariantProps<typeof inputVariants>>(
  ({ className, variant, size, ...props }, ref) => (
    <input ref={ref} className={cn(inputVariants({ variant, size, className }))} {...props} />
  )
)
Input.displayName = 'Input'

export { Input, inputVariants }
