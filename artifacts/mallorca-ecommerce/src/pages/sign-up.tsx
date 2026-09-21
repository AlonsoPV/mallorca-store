import { Redirect } from "wouter";

export default function SignUpPage() {
  const search = typeof window === "undefined" ? "" : window.location.search;
  return <Redirect to={`/sign-in${search}`} />;
}
