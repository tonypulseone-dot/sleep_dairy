import { redirect } from "next/navigation";
import { currentConsultant } from "@/lib/pro-session";
import { ConsultantRegister } from "@/components/ConsultantRegister";
export default async function RegisterPage() {
  if (await currentConsultant()) redirect("/pro/profile");
  return <ConsultantRegister />;
}
