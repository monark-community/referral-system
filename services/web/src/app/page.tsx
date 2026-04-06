// Purpose: App root page - redirects all visitors to the welcome/landing page

import { redirect } from "next/navigation";

export default function Home() {
  redirect("/referrals/welcome");
}
