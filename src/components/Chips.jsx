import React from "react";

// Une rangée de puces exclusives. value null = aucune.
export default function Chips({ options, value, onChange, allowNone = true }) {
  return (
    <div className="chips">
      {options.map(([v, label]) => (
        <button key={v} type="button" className={"chip" + (value === v ? " on" : "")}
          onClick={() => onChange(value === v && allowNone ? null : v)}>{label}</button>
      ))}
    </div>
  );
}
