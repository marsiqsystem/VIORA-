"use client";

import { products } from "@wix/stores";
import { useEffect, useState } from "react";
import Add from "./Add";

const CustomizeProducts = ({
  productId,
  productName,
  basePrice,
  variants,
  productOptions,
  onOptionChange,
}: {
  productId: string;
  productName: string;
  basePrice: number;
  variants: products.Variant[];
  productOptions: products.ProductOption[];
  onOptionChange?: (options: { [key: string]: string }) => void;
}) => {
  const [selectedOptions, setSelectedOptions] = useState<{
    [key: string]: string;
  }>({});
  const [selectedVariant, setSelectedVariant] = useState<products.Variant>();

  // Auto-select the Color option on mount so variant stock checks work.
  // Color swatches (ColorVariantSwatches) handle navigation between color
  // siblings (separate Wix products), so the Color dropdown is hidden. But
  // the variant matching still needs a color value in selectedOptions.
  useEffect(() => {
    const colorOption = productOptions.find(
      (opt) => opt.name?.toLowerCase() === "color"
    );
    if (colorOption?.choices?.[0]?.description) {
      setSelectedOptions((prev) => {
        if (prev[colorOption.name!]) return prev; // already set
        return { ...prev, [colorOption.name!]: colorOption.choices![0].description! };
      });
    }
  }, [productOptions]);

  useEffect(() => {
    const variant = variants.find((v) => {
      const variantChoices = v.choices;
      if (!variantChoices) return false;
      return Object.entries(selectedOptions).every(
        ([key, value]) => variantChoices[key] === value
      );
    });
    setSelectedVariant(variant);
  }, [selectedOptions, variants]);

  // Notify parent when options change
  useEffect(() => {
    if (onOptionChange) {
      onOptionChange(selectedOptions);
    }
  }, [selectedOptions, onOptionChange]);

  const handleOptionSelect = (optionType: string, choice: string) => {
    setSelectedOptions((prev) => ({ ...prev, [optionType]: choice }));
  };

  const isVariantInStock = (choices: { [key: string]: string }) => {
    return variants.some((variant) => {
      const variantChoices = variant.choices;
      if (!variantChoices) return false;

      const choicesMatch = Object.entries(choices).every(
        ([key, value]) => variantChoices[key] === value
      );
      if (!choicesMatch) return false;

      // If stock info exists, check it; otherwise treat as in stock
      if (!variant.stock) return true;
      if (variant.stock.inStock === false) return false;
      // If quantity is tracked and is 0, it's out of stock
      if (variant.stock.quantity !== undefined && variant.stock.quantity !== null && variant.stock.quantity <= 0) return false;
      return true;
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {productOptions.map((option) => {
        if (option.name?.toLowerCase() === 'color') return null;
        
        return (
          <div className="flex flex-col gap-4" key={option.name}>
            <h4 className="font-medium">Choose {option.name}</h4>
            <ul className="flex items-center gap-3">
            {option.choices?.map((choice) => {
              const disabled = !isVariantInStock({
                ...selectedOptions,
                [option.name!]: choice.description!,
              });

              const selected =
                selectedOptions[option.name!] === choice.description;

              const clickHandler = disabled
                ? undefined
                : () => handleOptionSelect(option.name!, choice.description!);

              return option.name === "Color" ? (
                <li
                  className="w-8 h-8 rounded-full ring-1 ring-gray-300 relative"
                  style={{
                    backgroundColor: choice.value,
                    cursor: disabled ? "not-allowed" : "pointer",
                  }}
                  onClick={clickHandler}
                  key={choice.description}
                >
                  {selected && (
                    <div className="absolute w-10 h-10 rounded-full ring-[#c7c6c7ff] ring-2 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                  )}
                  {disabled && (
                    <div className="absolute w-10 h-[2px] bg-red-400 rotate-45 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                  )}
                </li>
              ) : (
                <li
                  className="ring-1 ring-accent text-accent rounded-md py-1 px-4 text-sm"
                  style={{
                    cursor: disabled ? "not-allowed" : "pointer",
                    backgroundColor: selected
                      ? "#000000"
                      : disabled
                        ? "#c7c6c7ff"
                        : "white",
                    color: selected || disabled ? "white" : "#000000",
                    boxShadow: disabled ? "none" : "",
                  }}
                  key={choice.description}
                  onClick={clickHandler}
                >
                  {choice.description}
                </li>
              );
            })}
          </ul>
        </div>
        );
      })}
      <Add
        productId={productId}
        variantId={
          selectedVariant?._id || "00000000-0000-0000-0000-000000000000"
        }
        stockNumber={
          selectedVariant?.stock?.quantity !== undefined && selectedVariant?.stock?.quantity !== null
            ? selectedVariant.stock.quantity
            : selectedVariant?.stock?.inStock !== false
              ? 999
              : 0
        }
        productName={productName}
        productPrice={basePrice}
        selectedOptions={selectedOptions}
      />
    </div>
  );
};

export default CustomizeProducts;
