"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getMedico, getToken } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const token = getToken();
    const medico = getMedico();
    if (!token || !medico) {
      router.replace("/login");
      return;
    }
    if (!medico.perfil_completo) {
      router.replace("/completar-perfil");
      return;
    }
    if (!medico.validado || !medico.matricula_validada) {
      router.replace("/cuenta-en-revision");
      return;
    }
    router.replace("/dashboard");
  }, [router]);
  return null;
}
