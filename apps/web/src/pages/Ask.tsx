import { AskBody } from "../components/AskPanel";
import { PageHeader } from "../components/ui";

export default function Ask() {
  return (
    <>
      <PageHeader title="Ask TIQ" ai subtitle="Questions over the cycle with citations. TIQ cannot take actions." />
      <div className="card mx-auto h-[70vh] max-w-3xl overflow-hidden"><AskBody /></div>
    </>
  );
}
