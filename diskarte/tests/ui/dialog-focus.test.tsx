import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Modal } from "@/components/ui/Modal";
it("does not move focus away from a field tapped before the opening animation frame",()=>{
  const frames:FrameRequestCallback[]=[];
  const request=vi.spyOn(window,"requestAnimationFrame").mockImplementation((callback)=>{frames.push(callback);return frames.length;});
  try {
    render(<Modal open title="Form" onClose={()=>{}}><label>Reason<input/></label></Modal>);
    screen.getByLabelText("Reason").focus();
    act(()=>{frames.forEach((callback)=>callback(0));});
    expect(screen.getByLabelText("Reason")).toHaveFocus();
  } finally {request.mockRestore();}
});
