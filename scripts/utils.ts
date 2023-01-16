import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ContractTransaction, ethers} from "ethers";
import {PlayerNFT} from "../typechain-types";

// Should match contract
export enum Skill {
  NONE,
  PAINT,
  DEFENCE,
  FISH,
  COOK,
}

export enum Item {
  DUMMY,
  MYSTERY_BOX,
  BRUSH,
  WAND,
  SHIELD,
  BRONZE_NECKLACE,
  WOODEN_FISHING_ROD,
  IGNORE_NOW_OTHER_ITEMS,
  COD,
}

export enum Attribute {
  NONE,
  ATTACK,
  DEFENCE,
}

export enum EquipPosition {
  HEAD,
  NECK,
  BODY,
  ARMS,
  LEGS,
  BOOTS,
  SPARE1,
  SPARE2,
  LEFT_ARM,
  RIGHT_ARM,
  ARROW_SATCHEL,
  MAGIC_BAG,
  FOOD,
  NONE,
}

export type Stats = {
  attack: number;
  magic: number;
  range: number;
  meleeDefence: number;
  magicDefence: number;
  rangeDefence: number;
  health: number;
  // Spare
};

export type Equipment = {
  itemTokenId: number;
  numToEquip: number;
};

export type QueuedAction = {
  actionId: number;
  skill: Skill;
  timespan: number;
  extraEquipment: Equipment[];
};

export const createPlayer = async (
  nft: PlayerNFT,
  avatarId: number,
  account: SignerWithAddress,
  name: string
): Promise<ethers.BigNumber> => {
  const tx = await nft.connect(account).mintPlayer(avatarId, name);
  const receipt = await tx.wait();
  const event = receipt?.events?.filter((x) => {
    return x.event == "NewPlayer";
  })[0].args;
  return event?.tokenId;
};

export const getActionId = async (tx: ContractTransaction): Promise<ethers.BigNumber> => {
  const receipt = await tx.wait();
  const event = receipt?.events?.filter((x) => {
    return x.event == "AddAction";
  })[0].args;
  return event?.actionId;
};
