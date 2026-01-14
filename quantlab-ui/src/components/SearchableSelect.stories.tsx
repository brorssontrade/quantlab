import { useState } from "react";

import SearchableSelect from "./SearchableSelect";

const SAMPLE_OPTIONS = [
  { value: "ABB.ST", label: "ABB.ST", description: "ABB Ltd" },
  { value: "ALFA.ST", label: "ALFA.ST", description: "Alfa Laval" },
  { value: "VOLV-B.ST", label: "VOLV-B.ST", description: "Volvo B" },
];

export default {
  title: "Components/SearchableSelect",
  component: SearchableSelect,
};

export const Default = () => {
  const [value, setValue] = useState("");
  return (
    <div className="max-w-sm space-y-3">
      <SearchableSelect
        value={value}
        onChange={setValue}
        options={SAMPLE_OPTIONS}
        inputPlaceholder="Välj symbol"
      />
      <div className="text-sm text-slate-500">Senaste val: {value || "inget"}</div>
    </div>
  );
};

export const Disabled = () => (
  <SearchableSelect
    value=""
    onChange={() => {}}
    options={SAMPLE_OPTIONS}
    disabled
    inputPlaceholder="Avstängd"
  />
);
