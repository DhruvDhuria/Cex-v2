import Signin from "../../components/auth/Signin";

export default function SigninPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-80 flex-col gap-4 rounded-lg bg-slate-950 p-6 text-sm">
        <Signin />
      </div>
    </div>
  );
}
