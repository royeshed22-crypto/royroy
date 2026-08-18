import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
}

export function Card({ glass = true, className, children, ...props }: CardProps) {
  return (
    <div className={cn(glass ? 'glass-card' : 'rounded-2xl', 'p-4', className)} {...props}>
      {children}
    </div>
  );
}
