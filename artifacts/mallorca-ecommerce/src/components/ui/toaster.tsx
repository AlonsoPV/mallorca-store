import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';
import { StorefrontToastIcon } from '@/components/storefront-notice';
import { useToast } from '@/hooks/use-toast';

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, kind, ...props }) {
        const isNotice = props.variant === 'notice';
        return (
          <Toast key={id} {...props}>
            {isNotice ? <StorefrontToastIcon kind={kind} /> : null}
            <div className="grid min-w-0 flex-1 gap-1">
              {title && (
                <ToastTitle className={isNotice ? 'font-serif text-base font-normal leading-tight' : undefined}>
                  {title}
                </ToastTitle>
              )}
              {description && (
                <ToastDescription className={isNotice ? 'text-sm leading-snug opacity-75' : undefined}>
                  {description}
                </ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
