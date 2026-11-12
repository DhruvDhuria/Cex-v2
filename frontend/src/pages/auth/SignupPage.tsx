import Signup from "../../components/auth/Signup";

export default function SignupPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-slate-950 p-5 text-sm sm:p-6">
        <Signup />
      </div>
    </div>
  );
}
