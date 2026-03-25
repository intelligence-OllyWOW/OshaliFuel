import { ReactNode, HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  glass?: boolean;
}

export default function Card({ children, className, glass = true, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl p-6 border border-gray-100',
        glass ? 'backdrop-blur-xl bg-glass-light shadow-sm' : 'bg-white shadow-sm',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
