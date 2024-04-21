"use client";

import BigNumber from "bignumber.js";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PeerMetadata } from "@/types/huddle01Type";
import { useEffect, useRef, useState } from "react";
import dripHuddleData from "@/lib/drip/dripHuddleData";
import { ItemsResponse } from "@/types/SearchAssetsType";
import PersonVideo from "@/components/huddle01/media/Video";
import ChangeDevice from "@/components/huddle01/changeDevice";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { useStudioState } from "@/lib/huddle01/studio/studioState";
import { Video, VideoOff, Mic, MicOff, Volume2 } from "lucide-react";
import { useLocalAudio, useLocalVideo } from "@huddle01/react/hooks";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import SpinnerLoadingAnimation from "@/components/ui/spinnerLoadingAnimation";
import { useDevices, useLocalMedia, useLocalPeer, useRoom } from "@huddle01/react/hooks";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { clusterApiUrl, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

interface dripHuddleDataInterface {
    collectionAddress: string;
    huddleRoom: string;
}

export default function HuddleLobbyPage({ params }: { params: { Huddle01Room: string } }) {
    const router = useRouter();
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();

    const { fetchStream } = useLocalMedia();
    const { name, setName } = useStudioState();
    const { metadata } = useLocalPeer<PeerMetadata>();

    const videoRef = useRef<HTMLVideoElement>(null);
    const { audioInputDevice, videoDevice } = useStudioState();
    const { isAudioOn, enableAudio, disableAudio } = useLocalAudio();
    const { stream, isVideoOn, enableVideo, disableVideo } = useLocalVideo();

    const { setPreferredDevice: setCamPrefferedDevice } = useDevices({ type: "cam" });
    const { setPreferredDevice: setAudioPrefferedDevice } = useDevices({ type: "mic" });

    const [checkCollectionVerification, setCheckCollectionVerification] = useState<boolean>(false);
    const [huddleDripCollectionRoomId, setHuddleDripCollectionRoomId] = useState<dripHuddleDataInterface>();

    const [creatorCollectionAddress, setCreatorCollectionAddress] = useState<string>("");

    const [isJoining, setIsJoining] = useState(false);
    const { joinRoom } = useRoom({
        onJoin: () => {
            setIsJoining(false);
            router.push(`./`);
        },
    });

    const makeTransaction = async ({ fromWallet, toWallet, amount, reference }: { fromWallet: PublicKey, toWallet: PublicKey, amount: number, reference: PublicKey }) => {
        const network = WalletAdapterNetwork.Devnet;
        const endpoint = clusterApiUrl(network);
        const connection = new Connection(endpoint, "confirmed");
        const { blockhash } = await connection.getLatestBlockhash("finalized");

        const transaction = new Transaction({
            recentBlockhash: blockhash,
            feePayer: fromWallet,
        });

        const transferInstruction = SystemProgram.transfer({
            fromPubkey: fromWallet,
            lamports: amount * LAMPORTS_PER_SOL,
            toPubkey: toWallet,
        });

        transferInstruction.keys.push({
            pubkey: reference,
            isSigner: false,
            isWritable: true,
        });

        transaction.add(transferInstruction);

        return transaction;
    };

    const doTransaction = async ({ amount, receiver }: { amount: number, receiver: PublicKey }) => {
        const fromWallet = publicKey?.toBase58();
        const toWallet = receiver;
        const bnAmount = new BigNumber(amount);
        const reference = Keypair.generate().publicKey;
        const transaction = await makeTransaction({
            fromWallet: new PublicKey(fromWallet!),
            toWallet,
            amount: bnAmount.toNumber(),
            reference
        });
        const signature = await sendTransaction(transaction, connection);
        console.log("Signature:", signature);

        return signature;
    };

    useEffect(() => {
        const findRoom = dripHuddleData.find((room) => room.huddleRoom == params.Huddle01Room);
        if (findRoom) {
            setHuddleDripCollectionRoomId((findRoom as unknown) as dripHuddleDataInterface);
        }
    }, [params.Huddle01Room]);

    const verifyNFTCollection = async (walletAddress: string, collectionAddress: string): Promise<ItemsResponse> => {
        const url = `https://mainnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY}` || "https://mainnet.helius-rpc.com";
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: "my-id",
                    method: "searchAssets",
                    params: {
                        ownerAddress: walletAddress,
                        grouping: ["collection", collectionAddress],
                        tokenType: "all",
                        displayOptions: {
                            showCollectionMetadata: true,
                        },
                    },
                }),
            });
            const data = await response.json();
            if (data.result.total > 0) {
                setCreatorCollectionAddress(data.result.items[0].creators[0].address);
            }

            return { items: data.result };
        } catch (error) {
            console.error("Error fetching tokens:", error);
            return { items: { total: 0, limit: 1000, cursor: "", items: [] } };
        }
    };

    console.log("Creator Collection Address:", creatorCollectionAddress);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const { items } = await verifyNFTCollection(publicKey?.toBase58()!, huddleDripCollectionRoomId?.collectionAddress!) as ItemsResponse;
                if (items.total > 0) {
                    setCheckCollectionVerification(true);
                }
                else {
                    setCheckCollectionVerification(false);
                }
            } catch (error) {
                console.error("Error fetching tokens:", error);
            }
        };

        fetchData();
    }, [publicKey, huddleDripCollectionRoomId]);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    useEffect(() => {
        setCamPrefferedDevice(videoDevice.deviceId);
        if (isVideoOn) {
            disableVideo();
            const changeVideo = async () => {
                const { stream } = await fetchStream({
                    mediaDeviceKind: "cam",
                });
                if (stream) {
                    enableVideo(stream);
                }
            };
            changeVideo();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoDevice]);

    useEffect(() => {
        setAudioPrefferedDevice(audioInputDevice.deviceId);
        if (isAudioOn) {
            disableAudio();
            const changeAudio = async () => {
                const { stream } = await fetchStream({
                    mediaDeviceKind: "mic",
                });
                if (stream) {
                    enableAudio(stream);
                }
            };
            changeAudio();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioInputDevice]);

    return (
        <>
            <Card className="w-full my-6">
                <CardContent className="w-full max-w-6xl p-0 mt-6 mx-auto aspect-video rounded-md border-[1px] bg-slate-100 dark:bg-slate-900">
                    {stream && (
                        <PersonVideo
                            stream={stream}
                            name={metadata?.displayName ?? "guest"}
                        />
                    )}
                </CardContent>
                <Card className="w-full max-w-4xl m-6 mx-auto">
                    <CardHeader>
                        <CardTitle className="flex justify-center">
                            Ready to Join?
                        </CardTitle>
                        <CardDescription className="flex justify-center">
                            Join the huddle01 and start the conversation
                        </CardDescription>
                        <CardContent className="pt-6">
                            <div className="flex gap-4 justify-center">
                                <ChangeDevice deviceType="cam">
                                    <Button
                                        variant={isVideoOn ? "outline" : "destructive"}
                                        onClick={() => {
                                            if (isVideoOn) {
                                                disableVideo();
                                            } else {
                                                enableVideo();
                                            }
                                        }}
                                    >
                                        {isVideoOn ? (<Video />) : (<VideoOff />)}
                                    </Button>
                                </ChangeDevice>
                                <ChangeDevice deviceType="mic">
                                    <Button
                                        variant={isAudioOn ? "outline" : "destructive"}
                                        onClick={() => {
                                            if (isAudioOn) {
                                                disableAudio();
                                            } else {
                                                enableAudio();
                                            }
                                        }}
                                    >
                                        {isAudioOn ? (<Mic />) : (<MicOff />)}
                                    </Button>
                                </ChangeDevice>
                                <ChangeDevice deviceType="speaker">
                                    <Button variant="outline">
                                        <Volume2 />
                                    </Button>
                                </ChangeDevice>
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-center pb-0">
                            <div className="flex flex-col gap-6">
                                <Input
                                    type="text"
                                    value={name}
                                    className="w-96"
                                    placeholder="Username"
                                    onChange={(e) => setName(e.target.value)}
                                />
                                <Button
                                    onClick={async () => {
                                        if (!name) {
                                            toast.error("Please enter your name");
                                            return;
                                        }
                                        if (!checkCollectionVerification) {
                                            toast.error("Maybe you don't have the required NFT collection to join this room.");
                                            return;
                                        }
                                        else {
                                            const isTransactionStatus = toast.loading("Sending Transaction...");
                                            try {
                                                // const txnHash = await doTransaction({ amount: 0.000080, receiver: new PublicKey("ETVZ97k3rZv96cwp3CYpPoBC74PKkQsNQ4ex6NHx2hRx") });
                                                const txnHash = await doTransaction({ amount: 0.000081, receiver: new PublicKey(creatorCollectionAddress) });
                                                if (txnHash) {
                                                    toast.dismiss(isTransactionStatus);
                                                    toast.success("Transaction sent successfully!");
                                                    const verify = toast.loading("Verifying NFT Collection...");
                                                    setIsJoining(true);
                                                    const response = await fetch(
                                                        `/api/token?roomId=${params.Huddle01Room}&displayName=${name}`
                                                    );
                                                    const token = await response.text();
                                                    await joinRoom({
                                                        roomId: params.Huddle01Room,
                                                        token,
                                                    });
                                                    toast.dismiss(verify);
                                                    toast.success("NFT Collection Verified!");
                                                }
                                                else {
                                                    toast.dismiss(isTransactionStatus);
                                                    toast.error("Transaction failed!");
                                                }
                                            }
                                            catch (error) {
                                                console.error("Error sending transaction:", error);
                                                toast.dismiss(isTransactionStatus);
                                                toast.error("Transaction failed!");
                                            }
                                        }
                                    }}
                                    disabled={isJoining}
                                >
                                    {isJoining ? (
                                        <div className="flex gap-2 items-center">
                                            <SpinnerLoadingAnimation size={24} />
                                            <span>Entering Room...</span>
                                        </div>
                                    ) : (
                                        "Enter Room"
                                    )}
                                </Button>
                            </div>
                        </CardFooter>
                    </CardHeader>
                </Card>
            </Card >
        </>
    )
}
