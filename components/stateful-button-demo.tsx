"use client";
import { Button } from "@/components/ui/stateful-button";
export default function StatefulButtonDemo() {
  return <div className="flex h-40 w-full items-center justify-center"><Button onClick={() => new Promise<void>(resolve => setTimeout(resolve, 1200))}>Enviar mensagem</Button></div>;
}
