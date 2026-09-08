import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import React from "react";
import { api, setToken } from "@/lib/api";

function Signup() {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      const response = await api.post<{ token: string }>("/signup", { username, password });
      setToken(response.data.token);
      window.location.reload();
    } catch (err) {
      setError(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Signup failed",
      );
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)}>
      <h1 className="text-4xl pb-2 font-bold">Create an Account</h1>
      <p className="text-xs text-neutral-50 pb-4">Fill in the details below to create your account.</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">Username</Label>
        <Input
          type="text"
          id="username"
          name="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Label htmlFor="password">Password</Label>
        <Input
          type="password"
          id="password"
          name="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <Button variant={"secondary"} type="submit">
          Sign up
        </Button>
      </div>
    </form>
  );
}

export default Signup;