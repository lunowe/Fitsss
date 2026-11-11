/**
 * The validators answer "startDate: that date has passed": the field is for
 * the API, the sentence for people. This keeps the sentence.
 */
export function readableError(message: string): string {
  const sentence = message.replace(/^[A-Za-z.]+: /, "");
  return sentence ? sentence[0].toUpperCase() + sentence.slice(1) : message;
}
