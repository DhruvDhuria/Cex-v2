import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import axios from "axios";
import React from "react";

function Signup() {
  const handleSubmit = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    e.preventDefault();
    // Handle form submission logic here
    try {
      const response = await axios.post(
        "http://localhost:3001/signup",
        {
          username: (document.getElementById("username") as HTMLInputElement)
            .value,
          password: (document.getElementById("password") as HTMLInputElement)
            .value,
        },
      );
      console.log(response.data);
    } catch (error) {
      console.error("Error signing up:", error);
    }
  };
  return (
    <div>
      <h1 className="text-4xl pb-2 font-bold">Create an Account</h1>
      <p className="text-xs text-neutral-50 pb-4">
        Fill in the details below to create your account.
      </p>
      <div className="flex flex-col gap-2 ">
        <Label htmlFor="username">Username</Label>
        <Input type="text" id="username" name="username" required />
        <Label htmlFor="password">Password</Label>
        <Input type="password" id="password" name="password" required />
        <Button
          variant={"secondary"}
          type="submit"
          onClick={(e) => handleSubmit(e)}
        >
          Sign up
        </Button>
      </div>
    </div>
  );
}

export default Signup;
