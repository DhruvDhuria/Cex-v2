import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { prisma } from "../db.js";
import { authSchema } from "../types/auth-schema.js";
import { createToken } from "../utils/auth.js";
import { sendValidationError } from "../utils/validation.js";

export async function signup(req: Request, res: Response): Promise<void> {
  const parsedBody = authSchema.safeParse(req.body);
  if (!parsedBody.success) {
    sendValidationError(res, parsedBody.error);
    return;
  }

  const { username, password } = parsedBody.data;
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
      },
    });

    res.status(201).json({
      token: createToken({ userId: user.id }),
      userId: user.id,
      username: user.username,
    });
  } catch {
    res.status(409).json({ error: "username already exists" });
  }
}

export async function signin(req: Request, res: Response): Promise<void> {
  //TODO: Implement signin logic
  const parsedBody = authSchema.safeParse(req.body);
  if (!parsedBody.success) {
    sendValidationError(res, parsedBody.error);
    return;
  }

  const {username, password} = parsedBody.data

  try {
    const user = await prisma.user.findFirst({
      where: {
        username
      }
    })

    if(!user) {
      res.status(404).json({
        error: "Cannot find user"
      })
      return
    }

    const validPassword = await bcrypt.compare(password, user.password)

    if(!validPassword) {
      res.status(401).json({
        error: "Password is incorrect"
      })
      return
    }

    const token = createToken({ userId: user.id });

    res.json({
      message: "Signed in successfully",
      token
    })

  } catch (error) {
    res.status(500).json({
      error: "Something went wrong while signing you in"
    })
  }

  
}
