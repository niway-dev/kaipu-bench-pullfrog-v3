import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Rail, type RailItem, type RailLinkProps } from "./rail";

interface LinkItem extends RailItem {
  to: string;
}

const items: LinkItem[] = [
  { id: "record", label: "Record", icon: <i data-testid="icon-record" />, to: "/", active: true },
  { id: "library", label: "Library", icon: <i data-testid="icon-library" />, to: "/library" },
];

describe("Rail", () => {
  it("renders each item through renderLink with its label and icon", () => {
    render(
      <Rail
        brand={<b>mark</b>}
        items={items}
        renderLink={(item, props) => <a href={item.to} {...props} />}
      />,
    );
    const link = screen.getByRole("link", { name: /library/i });
    expect(link).toHaveAttribute("href", "/library");
    expect(link).toHaveAttribute("title", "Library");
    expect(screen.getByTestId("icon-library")).toBeInTheDocument();
  });

  it("works with a non-routing element", () => {
    render(
      <Rail
        brand={null}
        items={items}
        renderLink={(item, props) => <span data-id={item.id} {...props} />}
      />,
    );
    expect(screen.getAllByText(/record|library/i)).toHaveLength(2);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("marks only the active item as the current page and styles it differently", () => {
    render(
      <Rail
        brand={null}
        items={items}
        renderLink={(item, props) => <a href={item.to} {...props} />}
      />,
    );
    const active = screen.getByRole("link", { name: /record/i });
    const idle = screen.getByRole("link", { name: /library/i });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(idle).not.toHaveAttribute("aria-current");
    expect(active.className).not.toBe(idle.className);
  });

  it("shows the brand with its title", () => {
    render(
      <Rail
        brand={<b>mark</b>}
        brandTitle="Kaipu Record"
        items={[]}
        renderLink={(_, props) => <span {...props} />}
      />,
    );
    expect(screen.getByTitle("Kaipu Record")).toHaveTextContent("mark");
  });

  it("draws no brand row when there is no brand", () => {
    const { container } = render(
      <Rail items={[]} brandTitle="Kaipu Record" renderLink={(_, props) => <span {...props} />} />,
    );
    expect(screen.queryByTitle("Kaipu Record")).toBeNull();
    expect(container.querySelector("nav")?.children).toHaveLength(1);
  });

  it("renders the account item in the footer, named by its label", () => {
    const account: LinkItem = { id: "account", label: "Account", icon: <i />, to: "/cloud" };
    render(
      <Rail
        brand={null}
        items={items}
        account={account}
        renderLink={(item, props) => <a href={item.to} {...props} />}
      />,
    );
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/cloud");
  });

  it("omits the footer when there is no account", () => {
    render(
      <Rail
        brand={null}
        items={items}
        renderLink={(item, props) => <a href={item.to} {...props} />}
      />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("shows a badge with its count and meaning, capped at 9+, and none at 0", () => {
    const { rerender } = render(
      <Rail
        brand={null}
        items={[{ ...items[1]!, badge: 2, badgeLabel: "2 new copies ready" }]}
        renderLink={(item, props) => <a href={item.to} {...props} />}
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent("2");
    expect(link).toHaveAccessibleName(/2 new copies ready/);
    rerender(
      <Rail
        brand={null}
        items={[{ ...items[1]!, badge: 12 }]}
        renderLink={(item, props) => <a href={item.to} {...props} />}
      />,
    );
    expect(screen.getByText("9+")).toBeInTheDocument();
    rerender(
      <Rail
        brand={null}
        items={[{ ...items[1]!, badge: 0 }]}
        renderLink={(item, props) => <a href={item.to} {...props} />}
      />,
    );
    expect(screen.getByRole("link")).toHaveTextContent(/^Library$/);
  });

  describe("modes (NIW2-626)", () => {
    const link = (item: LinkItem, props: RailLinkProps) => <a href={item.to} {...props} />;

    it("is stacked when no mode is given, so the landing mockup keeps its look", () => {
      const { container } = render(<Rail items={items} renderLink={link} />);
      expect(container.querySelector("nav")).toHaveAttribute("data-mode", "stacked");
    });

    it.each(["expanded-row", "stacked"] as const)(
      "%s shows every label as text and names each link by it",
      (mode) => {
        const { container } = render(<Rail mode={mode} items={items} renderLink={link} />);
        expect(container.querySelector("nav")).toHaveAttribute("data-mode", mode);
        expect(screen.getByRole("link", { name: "Library" })).toHaveTextContent("Library");
        expect(screen.queryByRole("tooltip")).toBeNull();
      },
    );

    it("collapsed keeps each link's accessible name with the label hidden", () => {
      const { container } = render(<Rail mode="collapsed" items={items} renderLink={link} />);
      expect(container.querySelector("nav")).toHaveAttribute("data-mode", "collapsed");
      const library = screen.getByRole("link", { name: "Library" });
      // No native title: the rail's own tooltip replaces it, so the two never stack.
      expect(library).not.toHaveAttribute("title");
    });

    it("collapsed shows a tooltip on hover and hides it on leave", () => {
      render(<Rail mode="collapsed" items={items} renderLink={link} />);
      const library = screen.getByRole("link", { name: "Library" });
      fireEvent.mouseEnter(library);
      expect(screen.getByRole("tooltip")).toHaveTextContent("Library");
      fireEvent.mouseLeave(library);
      expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("collapsed shows the tooltip on keyboard focus too, and hides it on blur", () => {
      render(<Rail mode="collapsed" items={items} renderLink={link} />);
      const record = screen.getByRole("link", { name: "Record" });
      fireEvent.focus(record);
      expect(screen.getByRole("tooltip")).toHaveTextContent("Record");
      fireEvent.blur(record);
      expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("draws the mode toggle in the footer and calls it on click", () => {
      let toggled = 0;
      render(
        <Rail
          mode="expanded-row"
          items={items}
          renderLink={link}
          modeToggle={{
            label: "Sidebar: expanded. Switch to stacked",
            hint: "⌘\\",
            icon: <i />,
            onToggle: () => toggled++,
          }}
        />,
      );
      const toggle = screen.getByRole("button", { name: "Sidebar: expanded. Switch to stacked" });
      fireEvent.click(toggle);
      expect(toggled).toBe(1);
    });

    it("the collapsed toggle has a tooltip with its shortcut", () => {
      render(
        <Rail
          mode="collapsed"
          items={items}
          renderLink={link}
          modeToggle={{ label: "Expand sidebar", hint: "⌘\\", icon: <i />, onToggle: () => {} }}
        />,
      );
      fireEvent.focus(screen.getByRole("button", { name: "Expand sidebar" }));
      expect(screen.getByRole("tooltip")).toHaveTextContent("Expand sidebar ⌘\\");
    });
  });
});
