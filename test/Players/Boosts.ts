import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {EstforConstants, EstforTypes, NONE} from "@paintswap/estfor-definitions";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {ethers} from "hardhat";
import {playersFixture} from "./PlayersFixture";
import {setupBasicMeleeCombat, setupBasicWoodcutting, setupBasicCooking} from "./utils";

describe("Boosts", function () {
  this.retries(3);

  const NOW = Math.floor(Date.now() / 1000);

  it("Add Boost, Full consume", async function () {
    const {playerId, players, itemNFT, world, alice} = await loadFixture(playersFixture);

    const boostValue = 10;
    const boostDuration = 3300;
    await itemNFT.addItem({
      ...EstforTypes.defaultInputItem,
      tokenId: EstforConstants.XP_BOOST,
      equipPosition: EstforTypes.EquipPosition.BOOST_VIAL,
      // Boost
      boostType: EstforTypes.BoostType.NON_COMBAT_XP,
      boostValue,
      boostDuration,
      isTransferable: false,
    });

    const {queuedAction, rate} = await setupBasicWoodcutting(itemNFT, world);

    await itemNFT.testMint(alice.address, EstforConstants.XP_BOOST, 1);
    expect(await itemNFT.balanceOf(alice.address, EstforConstants.XP_BOOST)).to.eq(1);
    await players
      .connect(alice)
      .startActionsWithBoost(
        playerId,
        [queuedAction],
        EstforConstants.XP_BOOST,
        NOW,
        EstforTypes.ActionQueueStatus.NONE
      );
    expect(await itemNFT.balanceOf(alice.address, EstforConstants.XP_BOOST)).to.eq(0);

    await ethers.provider.send("evm_increaseTime", [queuedAction.timespan + 2]);
    await players.connect(alice).processActions(playerId);
    expect(await players.xp(playerId, EstforTypes.Skill.WOODCUTTING)).to.eq(
      queuedAction.timespan + (boostDuration * boostValue) / 100
    );
    // Check the drops are as expected
    expect(await itemNFT.balanceOf(alice.address, EstforConstants.LOG)).to.eq(
      Math.floor((queuedAction.timespan * rate) / (3600 * 10))
    );
  });

  it("Add Boost, partial consume", async function () {
    const {playerId, players, itemNFT, world, alice} = await loadFixture(playersFixture);

    const boostValue = 10;
    await itemNFT.addItem({
      ...EstforTypes.defaultInputItem,
      tokenId: EstforConstants.XP_BOOST,
      equipPosition: EstforTypes.EquipPosition.BOOST_VIAL,
      // Boost
      boostType: EstforTypes.BoostType.NON_COMBAT_XP,
      boostValue,
      boostDuration: 7200,
      isTransferable: false,
    });

    const {queuedAction, rate} = await setupBasicWoodcutting(itemNFT, world);

    await itemNFT.testMint(alice.address, EstforConstants.XP_BOOST, 1);
    expect(await itemNFT.balanceOf(alice.address, EstforConstants.XP_BOOST)).to.eq(1);
    await players
      .connect(alice)
      .startActionsWithBoost(
        playerId,
        [queuedAction],
        EstforConstants.XP_BOOST,
        NOW,
        EstforTypes.ActionQueueStatus.NONE
      );
    expect(await itemNFT.balanceOf(alice.address, EstforConstants.XP_BOOST)).to.eq(0);

    await ethers.provider.send("evm_increaseTime", [queuedAction.timespan + 2]);
    await players.connect(alice).processActions(playerId);
    expect(await players.xp(playerId, EstforTypes.Skill.WOODCUTTING)).to.eq(
      queuedAction.timespan + (queuedAction.timespan * boostValue) / 100
    );
    // Check the drops are as expected
    expect(await itemNFT.balanceOf(alice.address, EstforConstants.LOG)).to.eq(
      Math.floor((queuedAction.timespan * rate) / (3600 * 10))
    );
  });

  describe("Boost overlaps", function () {
    it("Expired boost", async function () {
      // Expired boost should not affect XP
      const {playerId, players, itemNFT, world, alice} = await loadFixture(playersFixture);

      const boostValue = 50;
      await itemNFT.addItem({
        ...EstforTypes.defaultInputItem,
        tokenId: EstforConstants.XP_BOOST,
        equipPosition: EstforTypes.EquipPosition.BOOST_VIAL,
        // Boost
        boostType: EstforTypes.BoostType.NON_COMBAT_XP,
        boostValue,
        boostDuration: 86400,
        isTransferable: false,
      });

      const {queuedAction} = await setupBasicWoodcutting(itemNFT, world);

      await itemNFT.testMint(alice.address, EstforConstants.XP_BOOST, 1);
      await players
        .connect(alice)
        .startActionsWithBoost(
          playerId,
          [queuedAction],
          EstforConstants.XP_BOOST,
          NOW,
          EstforTypes.ActionQueueStatus.NONE
        );
      await ethers.provider.send("evm_increaseTime", [86400]);
      await players.connect(alice).startActions(playerId, [queuedAction], EstforTypes.ActionQueueStatus.NONE);
      await ethers.provider.send("evm_increaseTime", [86400]); // boost has expired
      await ethers.provider.send("evm_mine", []);

      const pendingQueuedActionState = await players.pendingQueuedActionState(alice.address, playerId);
      expect(pendingQueuedActionState.xpGained[0].xp).to.eq(queuedAction.timespan);

      await players.connect(alice).processActions(playerId);
      expect(await players.xp(playerId, EstforTypes.Skill.WOODCUTTING)).to.eq(
        queuedAction.timespan + (queuedAction.timespan * boostValue) / 100 + queuedAction.timespan
      );
    });

    it("Boost end finish inbetween action start and end", async function () {
      const {playerId, players, itemNFT, world, alice} = await loadFixture(playersFixture);

      const boostValue = 50;
      await itemNFT.addItem({
        ...EstforTypes.defaultInputItem,
        tokenId: EstforConstants.XP_BOOST,
        equipPosition: EstforTypes.EquipPosition.BOOST_VIAL,
        // Boost
        boostType: EstforTypes.BoostType.NON_COMBAT_XP,
        boostValue,
        boostDuration: 86400,
        isTransferable: false,
      });

      const {queuedAction} = await setupBasicWoodcutting(itemNFT, world);
      const queuedActionFinishAfterBoost = {...queuedAction};
      queuedActionFinishAfterBoost.timespan = 86400 - queuedAction.timespan;

      await itemNFT.testMint(alice.address, EstforConstants.XP_BOOST, 1);
      await players
        .connect(alice)
        .startActionsWithBoost(
          playerId,
          [queuedAction],
          EstforConstants.XP_BOOST,
          NOW,
          EstforTypes.ActionQueueStatus.NONE
        );
      await ethers.provider.send("evm_increaseTime", [queuedAction.timespan]);
      await players
        .connect(alice)
        .startActions(playerId, [queuedActionFinishAfterBoost], EstforTypes.ActionQueueStatus.NONE);
      await ethers.provider.send("evm_increaseTime", [queuedActionFinishAfterBoost.timespan]); // boost has expired in action end
      await ethers.provider.send("evm_mine", []);
      const pendingQueuedActionState = await players.pendingQueuedActionState(alice.address, playerId);
      expect(pendingQueuedActionState.xpGained[0].xp).to.eq(
        queuedActionFinishAfterBoost.timespan + (queuedActionFinishAfterBoost.timespan * boostValue) / 100
      );
    });

    it("Check boost is removed from being active when processing", async function () {
      const {playerId, players, itemNFT, world, alice} = await loadFixture(playersFixture);

      const boostValue = 50;
      await itemNFT.addItem({
        ...EstforTypes.defaultInputItem,
        tokenId: EstforConstants.XP_BOOST,
        equipPosition: EstforTypes.EquipPosition.BOOST_VIAL,
        // Boost
        boostType: EstforTypes.BoostType.NON_COMBAT_XP,
        boostValue,
        boostDuration: 100,
        isTransferable: false,
      });

      const {queuedAction} = await setupBasicWoodcutting(itemNFT, world);

      await itemNFT.testMint(alice.address, EstforConstants.XP_BOOST, 1);
      await players
        .connect(alice)
        .startActionsWithBoost(
          playerId,
          [queuedAction],
          EstforConstants.XP_BOOST,
          NOW,
          EstforTypes.ActionQueueStatus.NONE
        );
      await ethers.provider.send("evm_increaseTime", [120]);
      await ethers.provider.send("evm_mine", []);
      expect((await players.activeBoosts(playerId)).itemTokenId).to.not.eq(NONE);
      await players.connect(alice).processActions(playerId);
      expect((await players.activeBoosts(playerId)).itemTokenId).to.eq(NONE);
    });
  });

  it("Combat Boost", async function () {
    const {playerId, players, itemNFT, world, alice} = await loadFixture(playersFixture);

    const boostValue = 50;
    const boostDuration = 120;
    await itemNFT.addItem({
      ...EstforTypes.defaultInputItem,
      tokenId: EstforConstants.XP_BOOST,
      equipPosition: EstforTypes.EquipPosition.BOOST_VIAL,
      // Boost
      boostType: EstforTypes.BoostType.ANY_XP,
      boostValue,
      boostDuration,
      isTransferable: false,
    });

    const {queuedAction} = await setupBasicMeleeCombat(itemNFT, world);

    await itemNFT.testMint(alice.address, EstforConstants.XP_BOOST, 1);
    await players
      .connect(alice)
      .startActionsWithBoost(
        playerId,
        [queuedAction],
        EstforConstants.XP_BOOST,
        NOW,
        EstforTypes.ActionQueueStatus.NONE
      );
    await ethers.provider.send("evm_increaseTime", [queuedAction.timespan]);
    await ethers.provider.send("evm_mine", []);
    const pendingQueuedActionState = await players.pendingQueuedActionState(alice.address, playerId);
    const meleeXP = queuedAction.timespan + (boostDuration * boostValue) / 100;
    const healthXP = Math.floor(meleeXP / 3);
    expect(pendingQueuedActionState.xpGained[0].xp).to.be.oneOf([meleeXP + healthXP, meleeXP + healthXP - 1]);
    await players.connect(alice).processActions(playerId);
    expect(await players.xp(playerId, EstforTypes.Skill.MELEE)).to.eq(meleeXP);
    expect(await players.xp(playerId, EstforTypes.Skill.HEALTH)).to.be.deep.oneOf([
      BigNumber.from(healthXP),
      BigNumber.from(healthXP - 1),
    ]);
  });

  it("Any XP Boost", async function () {
    const {playerId, players, itemNFT, world, alice} = await loadFixture(playersFixture);

    const boostValue = 50;
    const boostDuration = 120;
    await itemNFT.addItem({
      ...EstforTypes.defaultInputItem,
      tokenId: EstforConstants.XP_BOOST,
      equipPosition: EstforTypes.EquipPosition.BOOST_VIAL,
      // Boost
      boostType: EstforTypes.BoostType.ANY_XP,
      boostValue,
      boostDuration,
      isTransferable: false,
    });

    const {queuedAction, rate} = await setupBasicWoodcutting(itemNFT, world);

    await itemNFT.testMint(alice.address, EstforConstants.XP_BOOST, 1);
    await players
      .connect(alice)
      .startActionsWithBoost(
        playerId,
        [queuedAction],
        EstforConstants.XP_BOOST,
        NOW,
        EstforTypes.ActionQueueStatus.NONE
      );
    await ethers.provider.send("evm_increaseTime", [queuedAction.timespan]);
    await ethers.provider.send("evm_mine", []);
    const pendingQueuedActionState = await players.pendingQueuedActionState(alice.address, playerId);
    expect(pendingQueuedActionState.xpGained[0].xp).to.eq(queuedAction.timespan + (boostDuration * boostValue) / 100);
    await players.connect(alice).processActions(playerId);
    expect(await players.xp(playerId, EstforTypes.Skill.WOODCUTTING)).to.eq(
      queuedAction.timespan + (boostDuration * boostValue) / 100
    );
    // Check the drops are as expected
    expect(await itemNFT.balanceOf(alice.address, EstforConstants.LOG)).to.eq(
      Math.floor((queuedAction.timespan * rate) / (3600 * 10))
    );
  });

  it("TODO, swap boost", async function () {
    // Check that they are minted/consumed as expected
  });

  it("TODO Clear everything, check boost", async function () {
    // Check that they are
  });

  it("Gathering boost", async function () {
    const {playerId, players, itemNFT, world, alice} = await loadFixture(playersFixture);

    const boostValue = 10;
    const boostDuration = 3600;
    await itemNFT.addItem({
      ...EstforTypes.defaultInputItem,
      tokenId: EstforConstants.GATHERING_BOOST,
      equipPosition: EstforTypes.EquipPosition.BOOST_VIAL,
      // Boost
      boostType: EstforTypes.BoostType.GATHERING,
      boostValue,
      boostDuration,
      isTransferable: false,
    });

    const {queuedAction, rate} = await setupBasicWoodcutting(itemNFT, world);
    await itemNFT.testMint(alice.address, EstforConstants.GATHERING_BOOST, 1);
    expect(await itemNFT.balanceOf(alice.address, EstforConstants.GATHERING_BOOST)).to.eq(1);
    await players
      .connect(alice)
      .startActionsWithBoost(
        playerId,
        [queuedAction],
        EstforConstants.GATHERING_BOOST,
        NOW,
        EstforTypes.ActionQueueStatus.NONE
      );
    expect(await itemNFT.balanceOf(alice.address, EstforConstants.GATHERING_BOOST)).to.eq(0);

    await ethers.provider.send("evm_increaseTime", [queuedAction.timespan]);
    await players.connect(alice).processActions(playerId);
    expect(await players.xp(playerId, EstforTypes.Skill.WOODCUTTING)).to.eq(queuedAction.timespan);
    // Check the drops are as expected
    expect(await itemNFT.balanceOf(alice.address, EstforConstants.LOG)).to.eq(
      Math.floor((queuedAction.timespan * rate) / (3600 * 10) + (boostDuration * boostValue * rate) / (100 * 10 * 3600))
    );
  });

  it("Gathering boost, cooking with successPercent", async function () {
    const {playerId, players, itemNFT, world, alice} = await loadFixture(playersFixture);

    const boostValue = 10;
    const boostDuration = 3600;
    await itemNFT.addItem({
      ...EstforTypes.defaultInputItem,
      tokenId: EstforConstants.GATHERING_BOOST,
      equipPosition: EstforTypes.EquipPosition.BOOST_VIAL,
      // Boost
      boostType: EstforTypes.BoostType.GATHERING,
      boostValue,
      boostDuration,
      isTransferable: false,
    });

    const successPercent = 50;
    const minLevel = 1;
    const {queuedAction, rate} = await setupBasicCooking(itemNFT, world, successPercent, minLevel);
    await itemNFT.testMint(alice.address, EstforConstants.GATHERING_BOOST, 1);
    await players
      .connect(alice)
      .startActionsWithBoost(
        playerId,
        [queuedAction],
        EstforConstants.GATHERING_BOOST,
        NOW,
        EstforTypes.ActionQueueStatus.NONE
      );

    await ethers.provider.send("evm_increaseTime", [queuedAction.timespan]);
    await ethers.provider.send("evm_mine", []);

    const pendingQueuedActionState = await players.pendingQueuedActionState(alice.address, playerId);
    const foodCooked =
      (successPercent / 100) *
      ((queuedAction.timespan * rate) / (3600 * 10) + (boostDuration * boostValue * rate) / (100 * 10 * 3600));
    expect(pendingQueuedActionState.produced[0].amount).to.eq(foodCooked);

    await players.connect(alice).processActions(playerId);
    expect(await players.xp(playerId, EstforTypes.Skill.COOKING)).to.eq(queuedAction.timespan);
    // Check the drops are as expected
    expect(await itemNFT.balanceOf(alice.address, EstforConstants.COOKED_MINNUS)).to.eq(foodCooked);
  });

  it("Gathering boost, random rewards (100%) same day", async function () {});

  it("Gathering boost, random rewards (100%) next day", async function () {});
});
