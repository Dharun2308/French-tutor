import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";

/** A text field that will not let an English phone keyboard rewrite French. */
export const FrenchInput = React.forwardRef<HTMLInputElement, InputProps>(
  (props, ref) => (
    <Input
      ref={ref}
      lang="fr"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck={false}
      enterKeyHint="done"
      {...props}
    />
  )
);

FrenchInput.displayName = "FrenchInput";
