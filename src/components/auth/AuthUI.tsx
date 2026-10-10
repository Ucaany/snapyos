"use client";

import * as React from "react";
import { useState, useId, useEffect, useRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Eye, EyeOff } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useActionState } from "react";

import {
  loginAction,
  registerAction,
  staffLoginBoothsAction,
  type FormState,
} from "@/server/auth-actions";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface TypewriterProps {
  text: string | string[];
  speed?: number;
  cursor?: string;
  loop?: boolean;
  deleteSpeed?: number;
  delay?: number;
  className?: string;
}

export function Typewriter({
  text,
  speed = 100,
  cursor = "|",
  loop = false,
  deleteSpeed = 50,
  delay = 1500,
  className,
}: TypewriterProps) {
  const [displayText, setDisplayText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [textArrayIndex, setTextArrayIndex] = useState(0);

  const textArray = Array.isArray(text) ? text : [text];
  const currentText = textArray[textArrayIndex] || "";

  useEffect(() => {
    if (!currentText) return;

    const timeout = setTimeout(
      () => {
        if (!isDeleting) {
          if (currentIndex < currentText.length) {
            setDisplayText((prev) => prev + currentText[currentIndex]);
            setCurrentIndex((prev) => prev + 1);
          } else if (loop) {
            setTimeout(() => setIsDeleting(true), delay);
          }
        } else {
          if (displayText.length > 0) {
            setDisplayText((prev) => prev.slice(0, -1));
          } else {
            setIsDeleting(false);
            setCurrentIndex(0);
            setTextArrayIndex((prev) => (prev + 1) % textArray.length);
          }
        }
      },
      isDeleting ? deleteSpeed : speed,
    );

    return () => clearTimeout(timeout);
  }, [
    currentIndex,
    isDeleting,
    currentText,
    loop,
    speed,
    deleteSpeed,
    delay,
    displayText,
    text,
  ]);

  return (
    <span className={className}>
      {displayText}
      <span className="animate-pulse">{cursor}</span>
    </span>
  );
}

const labelVariants = cva(
  "font-mono text-xs font-bold uppercase tracking-[0.08em] leading-none text-ink peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
);

const Label = React.forwardRef<
  HTMLLabelElement,
  React.ComponentPropsWithoutRef<"label"> & VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <label ref={ref} className={cn(labelVariants(), className)} {...props} />
));
Label.displayName = "Label";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none border-2 border-ink text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-accent text-ink shadow-[2px_2px_0_0_#111111] hover:bg-accent active:shadow-none",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive active:shadow-none",
        outline: "border-ink bg-surface text-ink shadow-[2px_2px_0_0_#111111] hover:bg-bg active:shadow-none",
        secondary: "border-ink bg-ink text-bg hover:bg-ink",
        ghost: "border-transparent bg-transparent shadow-none hover:bg-muted hover:text-ink",
        link: "border-transparent bg-transparent text-ink shadow-none underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-none px-3",
        lg: "h-12 rounded-none px-6",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-none border-2 border-ink bg-surface px-3 py-3 text-sm text-ink transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
}
const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, label, ...props }, ref) => {
    const id = useId();
    const [showPassword, setShowPassword] = useState(false);
    const togglePasswordVisibility = () => setShowPassword((prev) => !prev);
    return (
      <div className="grid w-full items-center gap-2">
        {label && <Label htmlFor={id}>{label}</Label>}
        <div className="relative">
          <Input id={id} type={showPassword ? "text" : "password"} className={cn("pe-10", className)} ref={ref} {...props} />
          <button type="button" onClick={togglePasswordVisibility} className="absolute inset-y-0 end-0 flex h-full w-10 items-center justify-center text-muted-foreground/80 transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50" aria-label={showPassword ? "Hide password" : "Show password"}>
            {showPassword ? (<EyeOff className="size-4" aria-hidden="true" />) : (<Eye className="size-4" aria-hidden="true" />)}
          </button>
        </div>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

type LoginBooth = { photobox_id: string; name: string };
type FieldErrors = Record<string, string[]>;

const initial: FormState = {};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p role="alert" className="text-xs text-destructive">
      {errors[0]}
    </p>
  );
}

function FormError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="rounded-none border-2 border-destructive bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-ink"
    >
      {error}
    </div>
  );
}

function SignInForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  const fieldErrors = (state.fieldErrors ?? {}) as FieldErrors;

  const [booths, setBooths] = useState<LoginBooth[]>([]);
  const [pinMode, setPinMode] = useState(false);
  const [loadingBooths, setLoadingBooths] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  async function refreshBooths() {
    const email = emailRef.current?.value ?? "";
    setLoadingBooths(true);
    try {
      const list = await staffLoginBoothsAction(email);
      setBooths(list);
      setPinMode(list.length > 0);
    } catch {
      setBooths([]);
      setPinMode(false);
    } finally {
      setLoadingBooths(false);
    }
  }

  return (
    <form action={formAction} noValidate autoComplete="on" className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Sign in to your account</h1>
        <p className="text-balance text-sm text-muted-foreground">Enter your email below to sign in</p>
      </div>
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="m@example.com" required autoComplete="email" ref={emailRef} onBlur={() => void refreshBooths()} disabled={pending} />
          {fieldErrors.email && <FieldError errors={fieldErrors.email} />}
        </div>
        {pinMode ? (
          <div className="grid gap-2">
            <Label htmlFor="photobox_id">Booth</Label>
            <select id="photobox_id" name="photobox_id" required disabled={pending || loadingBooths} className="flex h-10 w-full rounded-none border-2 border-ink bg-surface px-3 py-3 text-sm text-ink transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50">
              <option value="">Pilih booth…</option>
              {booths.map((booth) => (
                <option key={booth.photobox_id} value={booth.photobox_id}>
                  {booth.name}
                </option>
              ))}
            </select>
            <div className="grid gap-2">
              <Label htmlFor="pin">PIN</Label>
              <Input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="current-password" required placeholder="••••" maxLength={6} disabled={pending} />
            </div>
            {fieldErrors.pin && <FieldError errors={fieldErrors.pin} />}
            {fieldErrors.photobox_id && <FieldError errors={fieldErrors.photobox_id} />}
          </div>
        ) : (
          <PasswordInput name="password" label="Password" required autoComplete="current-password" placeholder="Password" disabled={pending} />
        )}
        {fieldErrors.password && <FieldError errors={fieldErrors.password} />}
        <FormError error={state.error} />
        <Button type="submit" variant="outline" className="mt-2" disabled={pending}>
          {pending ? "Memproses…" : "Sign In"}
        </Button>
      </div>
    </form>
  );
}

function SignUpForm() {
  const [state, formAction, pending] = useActionState(registerAction, initial);

  return (
    <form action={formAction} noValidate autoComplete="on" className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Create an account</h1>
        <p className="text-balance text-sm text-muted-foreground">Enter your details below to sign up</p>
      </div>
      <div className="grid gap-4">
        <div className="grid gap-1"><Label htmlFor="name">Full Name</Label><Input id="name" name="name" type="text" placeholder="John Doe" required autoComplete="name" disabled={pending} /></div>
        <div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" placeholder="m@example.com" required autoComplete="email" disabled={pending} /></div>
        <PasswordInput name="password" label="Password" required autoComplete="new-password" placeholder="Password" disabled={pending} />
        <FormError error={state.error} />
        <Button type="submit" variant="outline" className="mt-2" disabled={pending}>
          {pending ? "Memproses…" : "Sign Up"}
        </Button>
      </div>
    </form>
  );
}

function AuthFormContainer({ isSignIn, onToggle }: { isSignIn: boolean; onToggle: () => void; }) {
    return (
        <div className="mx-auto grid w-[350px] gap-2">
            {isSignIn ? <SignInForm /> : <SignUpForm />}
            <div className="text-center text-sm">
                {isSignIn ? "Don't have an account?" : "Already have an account?"}{" "}
                <Button variant="link" className="pl-1 text-ink" onClick={onToggle}>
                    {isSignIn ? "Sign up" : "Sign in"}
                </Button>
            </div>
            <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-ink">
                <span className="relative z-10 bg-surface px-2 text-muted-foreground">Or continue with</span>
            </div>
            <Button variant="outline" type="button" onClick={() => console.log("UI: Google button clicked")}>
                <img src="https://cdn.21st.dev/assets/mirror/38/38146bfd9eff6dbf0d74771f2e625c70d87d3770e0d080dbb6e50db1d5403f46.svg" alt="Google icon" className="mr-2 h-4 w-4" />
                Continue with Google
            </Button>
        </div>
    )
}

interface AuthContentProps {
    image?: {
        src: string;
        alt: string;
    };
    quote?: {
        text: string;
        author: string;
    }
}

interface AuthUIProps {
    signInContent?: AuthContentProps;
    signUpContent?: AuthContentProps;
}

const defaultSignInContent = {
    image: {
        src: "https://cdn.21st.dev/assets/mirror/39/39e7b0edd6a7156713d08ec970769bf29360427d3dc8523ee32079885ccca5dd.png",
        alt: "A beautiful interior design for sign-in"
    },
    quote: {
        text: "Welcome Back! The journey continues.",
        author: "EaseMize UI"
    }
};

const defaultSignUpContent = {
    image: {
        src: "https://cdn.21st.dev/assets/mirror/c7/c7cb3a073970aa03472c652391db88fbbe39f1e33c8deb336a9c8e53b039ee01.png",
        alt: "A vibrant, modern space for new beginnings"
    },
    quote: {
        text: "Create an account. A new chapter awaits.",
        author: "EaseMize UI"
    }
};

export function AuthUI({ signInContent = {}, signUpContent = {} }: AuthUIProps) {
  const [isSignIn, setIsSignIn] = useState(true);
  const toggleForm = () => setIsSignIn((prev) => !prev);

  const finalSignInContent = {
      image: { ...defaultSignInContent.image, ...signInContent.image },
      quote: { ...defaultSignInContent.quote, ...signInContent.quote },
  };
  const finalSignUpContent = {
      image: { ...defaultSignUpContent.image, ...signUpContent.image },
      quote: { ...defaultSignUpContent.quote, ...signUpContent.quote },
  };

  const currentContent = isSignIn ? finalSignInContent : finalSignUpContent;

  return (
    <div className="w-full min-h-screen md:grid md:grid-cols-2">
      <style>{`
        input[type="password"]::-ms-reveal,
        input[type="password"]::-ms-clear {
          display: none;
        }
      `}</style>
      <div className="flex h-screen items-center justify-center p-6 md:h-auto md:p-0 md:py-12">
        <AuthFormContainer isSignIn={isSignIn} onToggle={toggleForm} />
      </div>

      <div
        className="hidden md:block relative bg-cover bg-center transition-all duration-500 ease-in-out"
        style={{ backgroundImage: `url(${currentContent.image.src})` }}
        key={currentContent.image.src}
      >

        <div className="absolute inset-x-0 bottom-0 h-[100px] bg-ink/80" />

        <div className="relative z-10 flex h-full flex-col items-center justify-end p-2 pb-6">
            <blockquote className="space-y-2 text-center text-ink">
              <p className="text-lg font-medium">
                “
                <Typewriter
                    key={currentContent.quote.text}
                    text={currentContent.quote.text}
                    speed={60}
                  />”
              </p>
              <cite className="block text-sm font-light text-muted-foreground not-italic">
                  — {currentContent.quote.author}
              </cite>
            </blockquote>
        </div>
      </div>
    </div>
  );
}
